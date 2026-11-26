"""Génération des références de devis (partagée dashboard + widget)."""

import re
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Company, Quote


# Prochaine référence libre pour l'entreprise : DEV-<année>-0001, 0002, …
# Le verrou porte sur la LIGNE entreprise (toujours existante) : deux créations
# simultanées (widget public + dashboard) liraient sinon le même max et
# produiraient la même référence — l'INSERT du second violerait la contrainte
# unique (company_id, reference) → 500. Un FOR UPDATE sur la plage des
# références serait piégeux : plage vide (premier devis de l'année) = gap locks
# compatibles entre transactions → deadlock InnoDB reproduit. SQLite ignore
# FOR UPDATE sans effet.
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
