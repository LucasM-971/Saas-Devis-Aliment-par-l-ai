"""Peuple la base avec des données de démonstration (idempotent : réinitialise d'abord).

Usage : depuis backend/, avec le venv actif :  python -m scripts.seed

Deux niveaux d'accès sont seedés :
- Démo publique (parcours /demo) : demo@devis-ai.fr / demo1234 — rôle « viewer »,
  strictement en lecture seule. Ces identifiants sont publics (ils figurent dans
  le bundle du front) car ce compte n'autorise aucune écriture.
- Comptes à privilèges (owner/admin/member de l'Atelier Dupont) : en dev, mot de
  passe partagé « motdepasse » (pratique en local) ; en prod (ENVIRONMENT=prod),
  un mot de passe fort aléatoire et non exporté — personne ne s'y connecte, ils ne
  portent que la paternité des données de démo. Aucun compte à privilèges n'est
  donc atteignable avec un mot de passe connu en production.

Le jeu de données suit le wedge produit : 1 métier (peinture / revêtements),
qualification par le chat, devis générés en brouillon puis validés par l'artisan.
Atelier Dupont est en plan premium (toutes les fonctionnalités visibles),
BâtiVert SARL en plan gratuit (démo des verrous premium).
"""

import secrets
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import delete

from app.config import settings
from app.core.security import hash_password
from app.database import SessionLocal
from app.models import (
    AuditLog,
    Company,
    Conversation,
    Invitation,
    Lead,
    Membership,
    PriceItem,
    Quote,
    QuoteLine,
    Service,
    ServiceZone,
    User,
    WidgetSettings,
)
from app.services.pricing_engine import LineInput, compute_quote

# ─── Compte de démonstration public (parcours /demo, rôle viewer) ─────────────
# Identifiants volontairement publics : ce compte est en lecture seule, il ne
# peut rien modifier. Le front s'y connecte pour le parcours « Voir la démo ».
DEMO_VIEWER_EMAIL = "demo@devis-ai.fr"
DEMO_VIEWER_PASSWORD = "demo1234"


def _staff_password() -> str:
    """Mot de passe des comptes à privilèges (owner/admin/member) du jeu de démo.

    En prod, un secret fort et aléatoire : ces comptes ne servent qu'à porter les
    données seedées, personne ne s'y connecte, et aucun mot de passe connu ne doit
    ouvrir un accès en écriture. En dev, mot de passe partagé pour le confort local.
    """
    if settings.environment == "prod":
        return secrets.token_urlsafe(24)
    return "motdepasse"


# ─── Grille tarifaire (métier peinture / revêtements, aligné sur le front) ───
# (libellé, unité, prix_unitaire)
PRICE_ITEMS = [
    ("Peinture murs (2 couches)", "m2", 28),
    ("Peinture plafond", "m2", 32),
    ("Enduit de lissage", "m2", 18),
    ("Pose de papier peint", "m2", 25),
    ("Pose de carrelage sol", "m2", 55),
    ("Pose de parquet stratifié", "m2", 35),
    ("Ragréage de sol", "m2", 22),
    ("Préparation et protection des surfaces", "flat", 250),
]

# Zone desservie : Paris intra-muros.
POSTAL_CODES = [f"750{arr:02d}" for arr in range(1, 21)]

# ─── Devis ────────────────────────────────────────────────────────────────────
# (réf, prénom, nom, email, statut_en, tva_ratio, date, [(libellé, qté, pu, unité)…])
QUOTES = [
    ("DEV-2026-0042", "Marie", "Lefèvre", "marie.lefevre@email.fr", "pending", 0.1, "2026-06-27",
     [("Pose de carrelage sol", 24, 55, "m2"), ("Préparation et protection des surfaces", 1, 250, "flat")]),
    ("DEV-2026-0041", "Sophie", "Bernard", "sophie.b@example.com", "validated", 0.1, "2026-06-26",
     [("Peinture murs (2 couches)", 85, 28, "m2"), ("Enduit de lissage", 85, 18, "m2")]),
    ("DEV-2026-0040", "Restaurant", "Le Comptoir", "gerant@lecomptoir.fr", "sent", 0.2, "2026-06-24",
     [("Peinture murs (2 couches)", 120, 28, "m2"), ("Peinture plafond", 60, 32, "m2")]),
    ("DEV-2026-0039", "Famille", "Nguyen", "nguyen.famille@email.fr", "accepted", 0.1, "2026-06-20",
     [("Pose de parquet stratifié", 40, 35, "m2"), ("Ragréage de sol", 40, 22, "m2")]),
    ("DEV-2026-0038", "Boulangerie", "Mistral", None, "rejected", 0.2, "2026-06-18",
     [("Pose de carrelage sol", 35, 55, "m2")]),
    ("DEV-2026-0037", "Julien", "Robert", None, "draft", 0.1, "2026-06-30",
     [("Peinture murs (2 couches)", 55, 28, "m2"), ("Peinture plafond", 25, 32, "m2")]),
    ("DEV-2026-0036", "Cabinet", "Dentaire Léa", None, "validated", 0.2, "2026-06-14",
     [("Pose de papier peint", 45, 25, "m2")]),
    ("DEV-2026-0035", "Hôtel", "des Voyageurs", None, "expired", 0.2, "2026-05-28",
     [("Peinture murs (2 couches)", 300, 28, "m2"), ("Préparation et protection des surfaces", 1, 250, "flat")]),
]

# ─── Prospects ────────────────────────────────────────────────────────────────
# (prénom, nom, email, téléphone, raison, date)
LEADS = [
    ("Lucie", "Girard", "lucie.g@free.fr", "06 12 34 56 78", "out_of_zone", "2026-07-02"),
    ("Marc", "Antoine", "marc.antoine@email.fr", "07 88 99 00 11", "incomplete", "2026-07-01"),
    ("Paul", "Mercier", "paul.mercier@email.fr", None, "unsupported_service", "2026-06-28"),
    ("Camille", "Fontaine", "camille.fontaine@email.fr", "06 55 44 33 22", "other", "2026-06-24"),
]

# ─── Journal d'activité ───────────────────────────────────────────────────────
AUDIT = [
    ("quote", "Lucas Martin", "a validé le devis", "DEV-2026-0041", "2026-06-27"),
    ("ai", "IA Devis AI", "a généré le devis (brouillon)", "DEV-2026-0042", "2026-06-27"),
    ("lead", "Widget", "a enregistré un nouveau prospect", "Lucie Girard", "2026-07-02"),
    ("quote", "Lucas Martin", "a envoyé le devis", "DEV-2026-0040", "2026-06-26"),
    ("pricing", "Sophie Bernard", "a modifié la grille tarifaire", "Pose de carrelage sol", "2026-06-26"),
    ("member", "Lucas Martin", "a invité un membre", "jordan.petit@atelier-dupont.fr", "2026-06-24"),
]

# ─── Base de connaissances du chatbot (publiée dans widget_settings) ─────────
KB_QAS = [
    {"question": "Comment obtenir un devis ?",
     "answer": "Décrivez-moi votre projet (surface, pièces, état des murs) et je prépare "
               "immédiatement un devis estimatif, validé ensuite par notre équipe."},
    {"question": "Le devis est-il gratuit ?",
     "answer": "Oui, l'établissement de votre devis est entièrement gratuit et sans engagement."},
    {"question": "Quels types de travaux réalisez-vous ?",
     "answer": "Peinture intérieure (murs et plafonds), enduits, papier peint, pose de carrelage "
               "et de parquet stratifié. Nous intervenons dans Paris intra-muros."},
    {"question": "Dans quel délai je reçois mon devis ?",
     "answer": "L'estimation est immédiate dans ce chat ; le devis finalisé et signé par un "
               "conseiller vous parvient sous 24 h ouvrées."},
    {"question": "Combien de temps le devis est-il valable ?",
     "answer": "Nos devis sont valables 30 jours à compter de la date d'émission."},
]

KB_BLOCS = [
    {"trigger": "je veux un devis commencer démarrer projet",
     "label": "Je veux un devis",
     "text": "Super ! Pour préparer votre devis, dites-moi : quel type de travaux souhaitez-vous ?",
     "buttons": ["Peinture murs/plafonds", "Sol (carrelage, parquet)", "Papier peint"]},
]

KB_PRIX_M2 = "28"

# ─── Conversations (transcriptions du chat rattachées aux devis / leads) ──────
CONV_QUOTE_0041 = [
    {"role": "assistant", "content": "Bonjour 👋 Je suis l'assistant de l'Atelier Dupont. Quel est votre projet ?"},
    {"role": "user", "content": "Bonjour, je voudrais repeindre mon couloir et mon salon."},
    {"role": "assistant", "content": "Avec plaisir ! Connaissez-vous la surface approximative à peindre ?"},
    {"role": "user", "content": "Environ 85 m² au total, murs uniquement."},
    {"role": "assistant", "content": "Parfait. Les murs sont-ils en bon état ou faut-il prévoir un enduit de lissage ?"},
    {"role": "user", "content": "Il y a quelques fissures, donc de la préparation oui."},
    {"role": "assistant", "content": "Très bien. Quel est le code postal du chantier ?"},
    {"role": "user", "content": "75011. Je suis Sophie Bernard, sophie.b@example.com"},
    {"role": "assistant", "content": "Merci Sophie ! Voici votre devis estimatif pour 85 m² de peinture + enduit. Un conseiller le finalise avec vous."},
]

CONV_QUOTE_0042 = [
    {"role": "assistant", "content": "Bonjour 👋 Comment puis-je vous aider ?"},
    {"role": "user", "content": "Je veux refaire le sol de ma cuisine en carrelage."},
    {"role": "assistant", "content": "Très bien ! Quelle surface fait votre cuisine ?"},
    {"role": "user", "content": "24 m², et le sol est un peu abîmé."},
    {"role": "assistant", "content": "Merci. Quel est le code postal du chantier ?"},
    {"role": "user", "content": "75015. Marie Lefèvre, marie.lefevre@email.fr"},
    {"role": "assistant", "content": "Merci Marie ! Voici votre devis estimatif. Un conseiller vous recontacte pour le valider."},
]

CONV_LEAD_LUCIE = [
    {"role": "assistant", "content": "Bonjour 👋 Je suis l'assistant de l'Atelier Dupont. Décrivez-moi votre projet !"},
    {"role": "user", "content": "Je voudrais repeindre mon salon, j'habite à Lyon."},
    {"role": "assistant", "content": "Malheureusement, Lyon est hors de notre zone d'intervention habituelle."},
    {"role": "user", "content": "Ah dommage. Vous pouvez quand même me recontacter ?"},
    {"role": "assistant", "content": "Bien sûr, je transmets votre demande à un conseiller. Puis-je avoir vos coordonnées ?"},
    {"role": "user", "content": "Lucie Girard, 06 12 34 56 78, lucie.g@free.fr"},
    {"role": "assistant", "content": "Merci Lucie ! Votre demande a bien été transmise, un conseiller vous rappellera rapidement."},
]


def run() -> None:
    db = SessionLocal()
    try:
        # Réinitialisation (les FK ON DELETE CASCADE nettoient le reste).
        db.execute(delete(Company))
        db.execute(delete(User))
        db.commit()

        dupont = Company(
            public_id=str(uuid.uuid4()),
            name="Atelier Dupont",
            slug="atelier-dupont",
            siret="123 456 789 00010",
            address="12 rue des Artisans, 75011 Paris",
            contact_email="contact@atelier-dupont.fr",
            contact_phone="01 42 00 00 00",
            default_vat_rate=Decimal("0.100"),
            metier="peinture",
            plan="premium",
        )
        bativert = Company(
            public_id=str(uuid.uuid4()),
            name="BâtiVert SARL",
            slug="bativert",
            metier="reno",
            plan="free",
        )
        db.add_all([dupont, bativert])
        db.flush()

        # Comptes à privilèges : mot de passe fort en prod, « motdepasse » en dev.
        staff_pw = hash_password(_staff_password())
        lucas = User(email="lucas@atelier-dupont.fr", password_hash=staff_pw, first_name="Lucas",
                     last_name="Martin", email_verified_at=datetime.now())
        sophie = User(email="sophie.bernard@atelier-dupont.fr", password_hash=staff_pw,
                      first_name="Sophie", last_name="Bernard")
        karim = User(email="karim.haddad@atelier-dupont.fr", password_hash=staff_pw,
                     first_name="Karim", last_name="Haddad")
        # Compte de démonstration public : rôle viewer (lecture seule), mot de passe public.
        demo = User(email=DEMO_VIEWER_EMAIL, password_hash=hash_password(DEMO_VIEWER_PASSWORD),
                    first_name="Démo", last_name="Invité", email_verified_at=datetime.now())
        db.add_all([lucas, sophie, karim, demo])
        db.flush()

        db.add_all([
            Membership(user_id=lucas.id, company_id=dupont.id, role="owner"),
            Membership(user_id=lucas.id, company_id=bativert.id, role="owner"),
            Membership(user_id=sophie.id, company_id=dupont.id, role="admin"),
            Membership(user_id=karim.id, company_id=dupont.id, role="member"),
            # Le compte de démo voit l'entreprise premium en lecture seule.
            Membership(user_id=demo.id, company_id=dupont.id, role="viewer"),
        ])
        db.add(Invitation(
            company_id=dupont.id, email="jordan.petit@atelier-dupont.fr", role="viewer",
            token_hash="seed-" + uuid.uuid4().hex, status="pending", invited_by=lucas.id,
            expires_at=datetime(2026, 12, 31),
        ))

        # Wedge « 1 métier » : un seul service chiffrable + sa zone d'intervention.
        peinture = Service(company_id=dupont.id, name="Peinture / revêtements", slug="peinture")
        db.add(peinture)
        db.flush()
        db.add_all([
            ServiceZone(company_id=dupont.id, label=f"Paris {code[-2:]}", postal_code=code)
            for code in POSTAL_CODES
        ])

        price_by_label: dict[str, PriceItem] = {}
        for label, unit, price in PRICE_ITEMS:
            item = PriceItem(
                company_id=dupont.id, service_id=peinture.id, label=label,
                unit=unit, unit_price=Decimal(str(price)),
            )
            db.add(item)
            price_by_label[label] = item
        db.flush()

        # Base de connaissances publiée (chat hébergé + widget embarqué).
        db.add(WidgetSettings(
            company_id=dupont.id,
            primary_color="#EA580C",
            greeting_message=None,
            config={"qas": KB_QAS, "blocs": KB_BLOCS, "prix_m2": KB_PRIX_M2},
        ))

        # Conversations liées aux devis / leads (transcriptions consultables).
        conversations: dict[str, Conversation] = {}
        for key, transcript, dstr in [
            ("q0041", CONV_QUOTE_0041, "2026-06-26"),
            ("q0042", CONV_QUOTE_0042, "2026-06-27"),
            ("lucie", CONV_LEAD_LUCIE, "2026-07-02"),
        ]:
            conv = Conversation(
                company_id=dupont.id,
                session_uid=str(uuid.uuid4()),
                transcript=transcript,
                status="completed",
                created_at=datetime.fromisoformat(dstr),
                completed_at=datetime.fromisoformat(dstr),
            )
            db.add(conv)
            conversations[key] = conv
        db.flush()

        conv_by_ref = {"DEV-2026-0041": conversations["q0041"], "DEV-2026-0042": conversations["q0042"]}

        for ref, first, last, email, st, vat, dstr, lines in QUOTES:
            tax = Decimal(str(vat * 100))
            computed = compute_quote(
                [LineInput(lbl, unit, Decimal(str(price)), Decimal(str(qty))) for lbl, qty, price, unit in lines],
                tax,
            )
            conv = conv_by_ref.get(ref)
            quote = Quote(
                company_id=dupont.id, reference=ref,
                conversation_id=conv.id if conv else None,
                service_id=peinture.id,
                customer_first_name=first, customer_last_name=last,
                customer_email=email, status=st, subtotal=computed.subtotal, tax_rate=tax,
                total=computed.total, created_by=lucas.id, created_at=datetime.fromisoformat(dstr),
            )
            quote.lines = [
                QuoteLine(label=c.label, unit=c.unit, quantity=c.quantity, unit_price=c.unit_price,
                          line_total=c.line_total, position=i,
                          price_item_id=(price_by_label[c.label].id if c.label in price_by_label else None))
                for i, c in enumerate(computed.lines)
            ]
            db.add(quote)

        for first, last, email, phone, reason, dstr in LEADS:
            db.add(Lead(
                company_id=dupont.id, first_name=first, last_name=last, email=email,
                phone=phone, reason=reason, status="new",
                conversation_id=(conversations["lucie"].id if first == "Lucie" else None),
                created_at=datetime.fromisoformat(dstr),
            ))

        for typ, actor, action, target, dstr in AUDIT:
            db.add(AuditLog(
                company_id=dupont.id, actor_user_id=lucas.id, action=f"{typ}.event",
                entity_type=typ, meta={"type": typ, "actor": actor, "action": action, "target": target},
                created_at=datetime.fromisoformat(dstr),
            ))

        db.commit()
        staff_login = (
            "lucas@atelier-dupont.fr / motdepasse"
            if settings.environment != "prod"
            else "lucas@atelier-dupont.fr / <mot de passe aléatoire, non exporté>"
        )
        print(
            f"Seed terminé : 2 entreprises (premium + free), 4 users, {len(QUOTES)} devis, "
            f"{len(PRICE_ITEMS)} postes (peinture), {len(POSTAL_CODES)} zones, "
            f"{len(LEADS)} leads, 3 conversations, base de connaissances publiée.\n"
            f"Démo publique (lecture seule) : {DEMO_VIEWER_EMAIL} / {DEMO_VIEWER_PASSWORD}\n"
            f"Compte propriétaire : {staff_login}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    run()
