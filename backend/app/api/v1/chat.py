import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import func, select

from app.api.deps import DbSession
from app.core.rate_limit import CHAT_MESSAGE_LIMITER, CHAT_QUOTE_LIMITER, rate_limited
from app.llm import client as llm
from app.llm import extractor
from app.llm.schemas import (
    CatalogItem,
    ChatRequest,
    ChatResponse,
    ExtractionResult,
    HistoryMessage,
    ServiceRef,
)
from app.models import (
    Company,
    Conversation,
    Lead,
    PriceItem,
    Quote,
    QuoteLine,
    QuoteVersion,
    Service,
    ServiceZone,
    WidgetSettings,
)
from app.schemas.conversation import (
    ChatQuoteResponse,
    QuoteFromChatRequest,
    QuoteLineResult,
    QuoteResult,
)
from app.schemas.widget import WidgetConfigOut
from app.services import audit_service
from app.services.pricing_engine import compute_discount
from app.services.quota import quote_quota
from app.services.quote_builder import BuildResult, ExtractedItem, PriceItemRef, build_quote
from app.services.references import next_quote_reference
from app.services.vat import applicable_tax_rate
from app.services.widget_kb import kb_from_config

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

# POST /chat/message → enregistre chaque tour
# POST /chat/quote   → extraction LLM → chiffrage → devis brouillon, sinon lead

# Message affiché au prospect selon le motif d'échec du chiffrage.
_LEAD_MESSAGES = {
    "out_of_zone": (
        "Votre adresse semble hors de notre zone d'intervention. "
        "Nous avons transmis votre demande : un conseiller vous recontactera."
    ),
    "unsupported_service": (
        "Cette prestation n'est pas encore chiffrable en ligne. "
        "Votre demande a été transmise pour être étudiée."
    ),
    "incomplete": (
        "Il nous manque quelques informations pour chiffrer votre projet. "
        "Un conseiller vous recontactera pour finaliser votre devis."
    ),
    # Quota gratuit atteint : on garde la demande en lead
    "quota_exceeded": (
        "Votre demande a bien été enregistrée. "
        "Un conseiller vous recontactera rapidement avec votre devis."
    ),
}
_LEAD_FALLBACK = _LEAD_MESSAGES["incomplete"]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _get_company(db: DbSession, public_id: str) -> Company:
    company = db.scalar(
        select(Company).where(Company.public_id == public_id, Company.is_active.is_(True))
    )
    if company is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entreprise introuvable")
    return company


# Public : réponse du bot. La base de connaissances est lue en base, rate-limité par IP.
@router.post(
    "/message",
    response_model=ChatResponse,
    dependencies=[Depends(rate_limited(CHAT_MESSAGE_LIMITER))],
)
def chat_message(payload: ChatRequest, db: DbSession) -> ChatResponse:
    company = _get_company(db, payload.company_public_id)

    settings = db.scalar(
        select(WidgetSettings).where(WidgetSettings.company_id == company.id)
    )
    qas, blocs, prix_m2, tarifs_m2 = kb_from_config(settings.config if settings else None)

    # Tour enregistré avant l'appel LLM, sans doublon en cas de réessai
    conversation = _get_or_create_conversation(db, company.id, payload.session_uid)
    transcript = conversation.transcript or []
    is_replay = bool(
        transcript
        and transcript[-1]["role"] == "user"
        and transcript[-1]["content"] == payload.message
    )
    if not is_replay:
        _append_turns(conversation, [("user", payload.message)])
        db.commit()

    try:
        reply = llm.generate_reply(
            message=payload.message,
            company_name=company.name,
            qas=qas,
            blocs=blocs,
            history=payload.history,
            prix_m2=prix_m2,
            tarifs_m2=tarifs_m2,
        )
    except llm.LLMUnavailable as exc:
        # 503 → le front affiche une erreur avec réessai (page hébergée).
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    _append_turns(conversation, [("assistant", reply.answer)])
    db.commit()
    return ChatResponse(
        answer=reply.answer, buttons=reply.buttons, session_uid=conversation.session_uid
    )


# Public : config du chatbot pour le widget et la page hébergée.
@router.get("/config/{company_public_id}", response_model=WidgetConfigOut)
def chat_config(company_public_id: str, db: DbSession) -> WidgetConfigOut:
    company = _get_company(db, company_public_id)

    settings = db.scalar(
        select(WidgetSettings).where(WidgetSettings.company_id == company.id)
    )
    qas, blocs, prix_m2, tarifs_m2 = kb_from_config(settings.config if settings else None)
    return WidgetConfigOut(
        company_public_id=company.public_id,
        company_name=company.name,
        primary_color=settings.primary_color if settings else "#2563EB",
        greeting_message=settings.greeting_message if settings else None,
        avatar_url=settings.avatar_url if settings else None,
        qas=qas,
        blocs=blocs,
        prix_m2=prix_m2,
        tarifs_m2=tarifs_m2,
    )


# Public : transforme une conversation en devis chiffré ou en lead.
@router.post(
    "/quote",
    response_model=ChatQuoteResponse,
    dependencies=[Depends(rate_limited(CHAT_QUOTE_LIMITER))],
)
def chat_quote(payload: QuoteFromChatRequest, db: DbSession) -> ChatQuoteResponse:
    company = _get_company(db, payload.company_public_id)
    conversation = _get_or_create_conversation(db, company.id, payload.session_uid)

    # Un devis engagé ou retouché par l'artisan n'est jamais écrasé
    existing = db.scalar(
        select(Quote)
        .where(Quote.conversation_id == conversation.id)
        .order_by(Quote.id.desc())
    )
    if existing is not None and (existing.status != "draft" or existing.artisan_edited):
        db.commit()
        return ChatQuoteResponse(
            outcome="quote",
            quote=_quote_result_from_quote(existing),
            message=(
                f"Votre devis {existing.reference} est en cours de traitement. "
                "Un conseiller revient vers vous rapidement."
            ),
        )

    price_items = db.scalars(
        select(PriceItem).where(
            PriceItem.company_id == company.id, PriceItem.is_active.is_(True)
        )
    ).all()
    services = db.scalars(
        select(Service).where(Service.company_id == company.id, Service.is_active.is_(True))
    ).all()
    zones = db.scalars(
        select(ServiceZone).where(
            ServiceZone.company_id == company.id, ServiceZone.is_active.is_(True)
        )
    ).all()

    slug_by_service_id = {s.id: s.slug for s in services}
    catalog = [
        CatalogItem(
            id=str(pi.id),
            label=pi.label,
            unit=pi.unit,
            service_slug=slug_by_service_id.get(pi.service_id),
        )
        for pi in price_items
    ]
    service_refs = [ServiceRef(slug=s.slug, name=s.name) for s in services]

    history, message = _extraction_input(conversation, payload)
    try:
        extraction = extractor.extract(
            message=message,
            company_name=company.name,
            history=history,
            catalog=catalog,
            services=service_refs,
        )
    except llm.LLMUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    _clamp_customer(extraction)

    # Coordonnées obligatoires avant tout enregistrement
    missing = _missing_contact_fields(extraction)
    if missing:
        db.commit()
        return ChatQuoteResponse(
            outcome="missing_info",
            missing_fields=missing,
            message=(
                "Pour transmettre votre demande, il me manque : "
                + ", ".join(missing)
                + ". Pouvez-vous me les indiquer ?"
            ),
        )

    result = build_quote(
        service_slug=extraction.service_slug,
        postal_code=extraction.postal_code,
        items=_to_extracted_items(extraction),
        grille=[
            PriceItemRef(id=pi.id, label=pi.label, unit=pi.unit, unit_price=pi.unit_price)
            for pi in price_items
        ],
        supported_services=[s.slug for s in services],
        served_postal_codes=[z.postal_code for z in zones if z.postal_code],
        # TODO : taux de TVA du chantier issu de l'arbre de qualification
        tax_rate=applicable_tax_rate(company),
    )

    # Le quota ne compte que les créations de devis
    if (
        result.computation is not None
        and existing is None
        and quote_quota(db, company.id, company.plan).exhausted
    ):
        result = BuildResult(computation=None, price_item_ids=(), lead_reason="quota_exceeded")

    _finalize_conversation(db, conversation, payload, extraction)

    if result.computation is None:
        lead = _create_lead(db, company.id, conversation.id, extraction, result.lead_reason)
        lead_name = " ".join(
            p for p in [lead.first_name, lead.last_name] if p
        ) or (lead.email or "Prospect")
        audit_service.record(
            db, company_id=company.id, type_="lead", actor="Widget",
            action="a enregistré un nouveau prospect", target=lead_name,
        )
        db.commit()
        return ChatQuoteResponse(
            outcome="lead",
            lead_reason=result.lead_reason,
            message=_LEAD_MESSAGES.get(result.lead_reason or "", _LEAD_FALLBACK),
        )

    if existing is not None:
        # Brouillon vivant : la demande enrichie met à jour LE MÊME devis.
        _apply_generated(existing, services, extraction, result)
        quote = existing
        audit_action = "a régénéré le devis (brouillon)"
    else:
        quote = _create_quote(db, company.id, conversation.id, services, extraction, result)
        audit_action = "a généré le devis (brouillon)"
    db.flush()
    _record_ai_version(db, quote, result)
    audit_service.record(
        db, company_id=company.id, type_="ai", actor="IA Devis AI",
        action=audit_action, target=quote.reference,
    )
    db.commit()
    db.refresh(quote)
    return ChatQuoteResponse(
        outcome="quote",
        quote=_serialize_quote(quote, result),
        message=(
            f"Voici votre devis estimatif {quote.reference}. "
            "Un conseiller peut le finaliser avec vous."
        ),
    )


# ─── Persistance de la conversation (un tour = une écriture) ─────────────────


# Récupère ou crée la conversation (session_uid unique par entreprise).
def _get_or_create_conversation(
    db: DbSession, company_id: int, session_uid: str | None
) -> Conversation:
    conversation: Conversation | None = None
    if session_uid:
        conversation = db.scalar(
            select(Conversation).where(
                Conversation.company_id == company_id,
                Conversation.session_uid == session_uid,
            )
        )
    if conversation is None:
        conversation = Conversation(
            company_id=company_id,
            session_uid=session_uid or str(uuid.uuid4()),
            status="open",
        )
        db.add(conversation)
        db.flush()  # attribue conversation.id avant tout usage (devis / lead)
    return conversation


# Ajoute des tours horodatés (réaffectation requise pour la colonne JSON).
def _append_turns(conversation: Conversation, turns: list[tuple[str, str]]) -> None:
    now = _utcnow()
    transcript = list(conversation.transcript or [])
    transcript.extend(
        {"role": role, "content": content, "ts": now.isoformat()} for role, content in turns
    )
    conversation.transcript = transcript
    conversation.last_activity_at = now


# Historique pour l'extraction : transcript en base, sinon celui du payload.
def _extraction_input(
    conversation: Conversation, payload: QuoteFromChatRequest
) -> tuple[list[HistoryMessage], str]:
    transcript = conversation.transcript or []
    if not transcript:
        return payload.history, payload.message
    entries = [HistoryMessage(role=e["role"], content=e["content"]) for e in transcript]
    last = transcript[-1]
    if last["role"] == "user" and last["content"] == payload.message:
        entries = entries[:-1]
    return entries, payload.message


# Fige la conversation : transcript, données extraites, statut completed.
def _finalize_conversation(
    db: DbSession,
    conversation: Conversation,
    payload: QuoteFromChatRequest,
    extraction: ExtractionResult,
) -> None:
    transcript = conversation.transcript or []
    if not transcript:
        # Client sans persistance par tour : on fige l'historique transmis.
        _append_turns(
            conversation,
            [(m.role, m.content) for m in payload.history] + [("user", payload.message)],
        )
    else:
        last_user = next((e for e in reversed(transcript) if e["role"] == "user"), None)
        if last_user is None or last_user["content"] != payload.message:
            _append_turns(conversation, [("user", payload.message)])
    conversation.extracted_data = extraction.model_dump()
    conversation.status = "completed"
    conversation.completed_at = _utcnow()
    conversation.last_activity_at = conversation.completed_at
    db.flush()


# ─── Helpers de chiffrage / persistance du devis ──────────────────────────────


# Tronque à la taille de la colonne pour éviter une DataError.
def _clamp(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value[:limit] or None


_EMAIL_ADAPTER = TypeAdapter(EmailStr)


_REQUIRED_CONTACT = (
    ("first_name", "votre prénom"),
    ("last_name", "votre nom"),
    ("phone", "votre numéro de téléphone"),
    ("email", "votre adresse email"),
)


def _missing_contact_fields(extraction: ExtractionResult) -> list[str]:
    missing = [
        label for attr, label in _REQUIRED_CONTACT
        if not getattr(extraction.customer, attr)
    ]
    postal = (extraction.postal_code or "").strip()
    if not (len(postal) == 5 and postal.isdigit()):
        missing.append("le code postal du chantier")
    return missing


# E-mail invalide ou trop long → None (jamais tronqué).
def _clean_email(value: str | None) -> str | None:
    if value is None or len(value) > 255:
        return None
    try:
        return _EMAIL_ADAPTER.validate_python(value.strip())
    except ValidationError:
        return None


# Borne les coordonnées extraites aux tailles des colonnes leads / quotes.
def _clamp_customer(extraction: ExtractionResult) -> None:
    customer = extraction.customer
    customer.first_name = _clamp(customer.first_name, 100)
    customer.last_name = _clamp(customer.last_name, 100)
    customer.email = _clean_email(customer.email)
    customer.phone = _clamp(customer.phone, 30)


# Convertit les postes extraits en entrées déterministes (ids invalides ignorés).
def _to_extracted_items(extraction: ExtractionResult) -> list[ExtractedItem]:
    items: list[ExtractedItem] = []
    for it in extraction.items:
        try:
            price_item_id = int(it.price_item_id)
        except (TypeError, ValueError):
            continue
        items.append(ExtractedItem(price_item_id=price_item_id, quantity=Decimal(str(it.quantity))))
    return items


def _create_lead(
    db: DbSession,
    company_id: int,
    conversation_id: int,
    extraction: ExtractionResult,
    reason: str | None,
) -> Lead:
    lead = Lead(
        company_id=company_id,
        conversation_id=conversation_id,
        first_name=extraction.customer.first_name,
        last_name=extraction.customer.last_name,
        email=extraction.customer.email,
        phone=extraction.customer.phone,
        request_text=extraction.notes,
        reason=reason or "other",
    )
    db.add(lead)
    return lead


# Applique le chiffrage au devis sans effacer les coordonnées existantes.
def _apply_generated(
    quote: Quote,
    services: list[Service],
    extraction: ExtractionResult,
    result: BuildResult,
) -> None:
    computation = result.computation
    assert computation is not None  # garanti par l'appelant
    quote.service_id = next(
        (s.id for s in services if s.slug == extraction.service_slug), None
    )
    quote.customer_first_name = extraction.customer.first_name or quote.customer_first_name
    quote.customer_last_name = extraction.customer.last_name or quote.customer_last_name
    quote.customer_email = extraction.customer.email or quote.customer_email
    quote.customer_phone = extraction.customer.phone or quote.customer_phone
    quote.subtotal = computation.subtotal
    quote.tax_rate = computation.tax_rate
    quote.total = computation.total
    quote.lines = [
        QuoteLine(
            price_item_id=price_item_id,
            label=computed.label,
            unit=computed.unit,
            quantity=computed.quantity,
            unit_price=computed.unit_price,
            line_total=computed.line_total,
            position=i,
        )
        for i, (price_item_id, computed) in enumerate(
            zip(result.price_item_ids, computation.lines)
        )
    ]


def _create_quote(
    db: DbSession,
    company_id: int,
    conversation_id: int,
    services: list[Service],
    extraction: ExtractionResult,
    result: BuildResult,
) -> Quote:
    quote = Quote(
        company_id=company_id,
        conversation_id=conversation_id,
        reference=next_quote_reference(db, company_id),
        status="draft",
    )
    _apply_generated(quote, services, extraction, result)
    db.add(quote)
    return quote


# Version IA conservée pour la comparer à l'envoi final
def _record_ai_version(db: DbSession, quote: Quote, result: BuildResult) -> None:
    computation = result.computation
    assert computation is not None
    last = (
        db.scalar(
            select(func.max(QuoteVersion.version_number)).where(
                QuoteVersion.quote_id == quote.id
            )
        )
        or 0
    )
    version = QuoteVersion(
        quote_id=quote.id,
        version_number=last + 1,
        source="ai",
        data={
            "subtotal": str(computation.subtotal),
            "tax_rate": str(computation.tax_rate),
            "total": str(computation.total),
            "lines": [
                {
                    "label": line.label,
                    "unit": line.unit,
                    "quantity": str(line.quantity),
                    "unit_price": str(line.unit_price),
                    "line_total": str(line.line_total),
                }
                for line in computation.lines
            ],
        },
    )
    db.add(version)
    db.flush()
    quote.current_version_id = version.id


def _serialize_quote(quote: Quote, result: BuildResult) -> QuoteResult:
    computation = result.computation
    assert computation is not None
    return QuoteResult(
        reference=quote.reference,
        subtotal=float(computation.subtotal),
        tax_rate=float(computation.tax_rate),
        tax_amount=float(computation.tax_amount),
        total=float(computation.total),
        currency=quote.currency,
        lines=[
            QuoteLineResult(
                label=line.label,
                unit=line.unit,
                quantity=float(line.quantity),
                unit_price=float(line.unit_price),
                line_total=float(line.line_total),
            )
            for line in computation.lines
        ],
    )


# Sérialise un devis existant sans le recalculer.
def _quote_result_from_quote(quote: Quote) -> QuoteResult:
    discount = compute_discount(
        quote.subtotal, quote.discount_type, quote.discount_value or Decimal(0)
    )
    net = quote.subtotal - discount
    return QuoteResult(
        reference=quote.reference,
        subtotal=float(quote.subtotal),
        tax_rate=float(quote.tax_rate),
        tax_amount=float(quote.total - net),
        total=float(quote.total),
        currency=quote.currency,
        lines=[
            QuoteLineResult(
                label=line.label,
                unit=line.unit,
                quantity=float(line.quantity),
                unit_price=float(line.unit_price),
                line_total=float(line.line_total),
            )
            for line in sorted(quote.lines, key=lambda x: x.position)
        ],
    )
