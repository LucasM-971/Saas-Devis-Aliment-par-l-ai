"""Métriques du pilote : conversations complétées, devis envoyés sans retouche, délai.

Usage (depuis backend/) : python -m scripts.pilot_metrics [--days 14] [--company slug]
"""

import argparse
import statistics
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Company, Conversation, Quote

ABANDON_HOURS = 24


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _pct(part: int, whole: int) -> str:
    return f"{100 * part / whole:.0f} %" if whole else "n/a (aucune donnée)"


def _minutes(seconds: float) -> str:
    return f"{seconds / 60:.1f} min"


def run(days: int, company_slug: str | None) -> None:
    db = SessionLocal()
    try:
        now = _utcnow()
        since = now - timedelta(days=days)

        company_id: int | None = None
        if company_slug:
            company = db.scalar(select(Company).where(Company.slug == company_slug))
            if company is None:
                raise SystemExit(f"Entreprise inconnue : {company_slug}")
            company_id = company.id

        conv_query = select(Conversation).where(Conversation.created_at >= since)
        quote_query = select(Quote).where(
            Quote.created_at >= since, Quote.conversation_id.is_not(None)
        )
        if company_id is not None:
            conv_query = conv_query.where(Conversation.company_id == company_id)
            quote_query = quote_query.where(Quote.company_id == company_id)

        conversations = db.scalars(conv_query).all()
        chat_quotes = db.scalars(quote_query).all()
        conv_by_id = {c.id: c for c in conversations}

        # ── 1. Taux de complétion ────────────────────────────────────────────
        completed = [c for c in conversations if c.status == "completed"]
        cutoff = now - timedelta(hours=ABANDON_HOURS)
        abandoned = [
            c
            for c in conversations
            if c.status == "open" and (c.last_activity_at or c.created_at) < cutoff
        ]
        in_progress = [
            c
            for c in conversations
            if c.status == "open" and (c.last_activity_at or c.created_at) >= cutoff
        ]
        settled = len(completed) + len(abandoned)

        # ── 2. Envoyables sans retouche ──────────────────────────────────────
        sent = [q for q in chat_quotes if q.sent_at is not None]
        sent_untouched = [q for q in sent if not q.artisan_edited]
        drafts = [q for q in chat_quotes if q.status == "draft"]
        drafts_touched = [q for q in drafts if q.artisan_edited]

        # ── 3. Délai demande → brouillon ─────────────────────────────────────
        delays: list[float] = []
        for quote in chat_quotes:
            conversation = conv_by_id.get(quote.conversation_id)
            if conversation and quote.created_at and conversation.created_at:
                delta = (quote.created_at - conversation.created_at).total_seconds()
                if delta >= 0:
                    delays.append(delta)

        print(f"MÉTRIQUES PILOTE — {days} derniers jours"
              + (f" — {company_slug}" if company_slug else " — toutes entreprises"))
        print("─" * 64)
        print(f"1. Conversations complétées : {_pct(len(completed), settled)}"
              f"   (seuil ≥ 30 %)")
        print(f"   complétées {len(completed)} · abandonnées {len(abandoned)}"
              f" · en cours {len(in_progress)} (hors calcul)")
        print(f"2. Envoyés sans retouche    : {_pct(len(sent_untouched), len(sent))}"
              f"   (seuil ≥ 50 %)")
        print(f"   envoyés {len(sent)} dont sans retouche {len(sent_untouched)}"
              f" · brouillons en attente {len(drafts)} (dont retouchés {len(drafts_touched)})")
        if delays:
            print(f"3. Délai demande → brouillon : médiane {_minutes(statistics.median(delays))}"
                  f" · p90 {_minutes(sorted(delays)[max(0, int(len(delays) * 0.9) - 1)])}"
                  f"   (seuil < 5 min)")
        else:
            print("3. Délai demande → brouillon : n/a (aucun devis issu du chat)")
        print("─" * 64)
        print("Rappel : « abandonnée » = open + inactif > 24 h, dérivé à la lecture.")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=14, help="fenêtre en jours (défaut 14)")
    parser.add_argument("--company", type=str, default=None, help="slug d'entreprise (défaut : toutes)")
    args = parser.parse_args()
    run(args.days, args.company)
