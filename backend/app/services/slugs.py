"""Génération de slugs uniques pour les entreprises."""

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Company


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "entreprise"


def unique_company_slug(db: Session, name: str) -> str:
    # Laisse la place au suffixe d'unicité
    base = slugify(name)[:140].strip("-") or "entreprise"
    slug, i = base, 2
    while db.scalar(select(Company.id).where(Company.slug == slug)):
        slug, i = f"{base}-{i}", i + 1
    return slug
