"""Les migrations Alembic produisent exactement le schéma des modèles."""

import os

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

import app.models  # noqa: F401  (enregistre les modèles dans Base.metadata)
from app.database import Base

TEST_URL = os.environ.get(
    "TEST_DATABASE_URL", "mysql+pymysql://devis:devis@localhost:3306/devis_ai_test"
)


def test_migrations_depuis_base_vide(monkeypatch):
    try:
        engine = create_engine(TEST_URL)
        engine.connect().close()
    except Exception:
        pytest.skip("MySQL de test indisponible")

    # Base réellement vide : ni tables applicatives, ni pointeur alembic.
    Base.metadata.drop_all(engine)
    with engine.begin() as conn:
        conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")

    # alembic/env.py lit settings.database_url : on le pointe sur la base de test.
    monkeypatch.setattr("app.config.settings.database_url", TEST_URL)
    config = Config("alembic.ini")
    command.upgrade(config, "head")

    try:
        inspector = inspect(engine)
        migrated_tables = set(inspector.get_table_names()) - {"alembic_version"}
        model_tables = set(Base.metadata.tables.keys())
        assert migrated_tables == model_tables, (
            f"tables migrées ≠ modèles : manquantes {model_tables - migrated_tables}, "
            f"en trop {migrated_tables - model_tables}"
        )
        for table in sorted(model_tables):
            migrated_cols = {c["name"] for c in inspector.get_columns(table)}
            model_cols = {c.name for c in Base.metadata.tables[table].columns}
            assert migrated_cols == model_cols, (
                f"colonnes divergentes sur {table} : "
                f"manquantes {model_cols - migrated_cols}, en trop {migrated_cols - model_cols}"
            )
    finally:
        # Rend la base aux autres tests (leurs fixtures font create_all/drop_all).
        with engine.begin() as conn:
            conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
        Base.metadata.drop_all(engine)
