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

# Flux public « conversation → devis » (surface pilote) :
#
#   POST /chat/message ──> Conversation (open) : un tour = une écriture
#        │  ...n tours (transcript horodaté, last_activity_at)
#        ▼
#   POST /chat/quote ────> transcript EN BASE → extraction LLM → chiffrage
#        │                 déterministe (grille + TVA entreprise/arbre)
#        ├── chiffrable ──> Quote draft : 1 conversation = 1 brouillon vivant
#        │                  (retour idempotent si engagé ou retouché artisan)
#        └── sinon ───────> Lead (motif) ; Conversation → completed dans les 2 cas

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
    # Quota mensuel du plan gratuit atteint : la demande est conservée en lead,
    # le prospect n'est pas exposé à la raison technique.
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


# Endpoint public : réponse conversationnelle du bot. L'entreprise est identifiée
# par son public_id et la base de connaissances est lue en base — le corps ne
# transporte que le message et l'historique (pas de prompt arbitraire possible).
# Rate-limité par IP : chaque message coûte un appel LLM.
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

    # Le tour utilisateur est persisté AVANT l'appel LLM : un échec IA (503)
    # laisse quand même la trace de la demande (métriques pilote + reprise).
    # Un réessai du même message (échec côté client) ne duplique pas le tour.
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


# Endpoint public : configuration du chatbot (apparence + base de connaissances).
# Consommé par le widget embarqué sur un site tiers et par la page hébergée.
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


# Endpoint public : transforme une conversation en devis chiffré (ou en lead).
# L'entreprise est identifiée par son public_id ; la grille et l'éligibilité sont lues en base.
@router.post(
    "/quote",
    response_model=ChatQuoteResponse,
    dependencies=[Depends(rate_limited(CHAT_QUOTE_LIMITER))],
)
def chat_quote(payload: QuoteFromChatRequest, db: DbSession) -> ChatQuoteResponse:
    company = _get_company(db, payload.company_public_id)
    conversation = _get_or_create_conversation(db, company.id, payload.session_uid)

    # Idempotence : 1 conversation = 1 brouillon vivant. Un devis engagé
    # (envoyé, accepté…) ou déjà retouché par l'artisan n'est JAMAIS écrasé
    # par un nouveau tour de chat : on le renvoie tel quel.
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

    # Coordonnées obligatoires : sans prénom, nom, téléphone, email et code
    # postal, rien n'est enregistré — le prospect est invité à les compléter.
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
        # L'arbre de qualification passera tree_rate= ici (lot B) : le taux du
        # chantier (10/20/5,5) prime alors sur le défaut de l'entreprise.
        tax_rate=applicable_tax_rate(company),
    )

    # Gate premium : le quota ne s'applique qu'à la CRÉATION d'un devis —
    # la mise à jour du brouillon existant de la conversation n'en consomme pas.
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


# Retrouve la conversation de CETTE entreprise pour cet uid de session, sinon
# la crée. L'unicité de session_uid est par entreprise : le même navigateur
# visitant deux artisans obtient deux conversations distinctes (plus de 500).
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


# Ajoute des tours horodatés au transcript et rafraîchit last_activity_at.
# La colonne JSON exige une réaffectation (pas de mutation en place).
def _append_turns(conversation: Conversation, turns: list[tuple[str, str]]) -> None:
    now = _utcnow()
    transcript = list(conversation.transcript or [])
    transcript.extend(
        {"role": role, "content": content, "ts": now.isoformat()} for role, content in turns
    )
    conversation.transcript = transcript
    conversation.last_activity_at = now


# Source de vérité de l'extraction : le transcript EN BASE quand la conversation
# a été persistée tour par tour ; sinon (ancien widget, tests) l'historique du
# payload. payload.message reste TOUJOURS le message courant (une demande
# enrichie ne doit pas être perdue) — on évite seulement de le dupliquer quand
# il est déjà le dernier tour en base.
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


# Fige la conversation au moment du chiffrage : transcript (complété si le
# message courant n'est pas déjà le dernier tour utilisateur en base), données
# extraites, statut completed.
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


# Tronque une valeur extraite par le LLM à la taille de sa colonne : le modèle
# recopie du texte de la conversation (contrôlé par le prospect) et une valeur
# trop longue ferait échouer l'INSERT en DataError (500 sur endpoint public).
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


# L'e-mail extrait devient le destinataire SMTP du devis : une troncature le
# corromprait silencieusement (envoi à une mauvaise adresse). Invalide → None,
# l'artisan le complètera dans l'éditeur.
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


# Applique le chiffrage généré sur le devis (création ou régénération du même
# brouillon). Les coordonnées extraites complètent sans effacer l'existant.
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


# Snapshot « brouillon généré par l'IA » : la métrique pilote « envoyable sans
# retouche » compare cette version à ce que l'artisan envoie réellement.
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


# Sérialise un devis existant depuis la base (retour idempotent : devis engagé
# ou retouché par l'artisan, renvoyé sans recalcul).
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
