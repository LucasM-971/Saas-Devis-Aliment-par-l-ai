"""Génération des références de devis (partagée dashboard + widget)."""

import re
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Company, Quote


# Prochaine référence DEV-<année>-NNNN.
# Verrouille la ligne entreprise pour éviter les doublons concurrents.
def next_quote_reference(db: Session, company_id: int) -> str:
    db.execute(select(Company.id).where(Company.id == company_id).with_for_update())
    prefix = f"DEV-{date.today().year}-"
    refs = db.scalars(
        select(Quote.reference).where(
            Quote.company_id == company_id, Quote.reference.like(f"{prefix}%")
        )
    ).all()
    max_n = max((int(m.group(1)) for r in refs if (m := re.search(r"-(\d+)$", r))), default=0)
    return f"{prefix}{max_n + 1:04d}"
