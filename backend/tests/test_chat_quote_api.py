import os
import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.database import Base, get_db
from app.llm import extractor
from app.llm.schemas import ExtractedCustomer, ExtractedLineItem, ExtractionResult
from app.main import app
from app.models import Company, Lead, PriceItem, Quote, Service, ServiceZone

TEST_URL = os.environ.get(
    "TEST_DATABASE_URL", "mysql+pymysql://devis:devis@localhost:3306/devis_ai_test"
)


@pytest.fixture
def env():
    try:
        engine = create_engine(TEST_URL)
        engine.connect().close()
    except Exception:
        pytest.skip("MySQL de test indisponible")

    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestingSession, TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def _seed(TestingSession):
    session = TestingSession()
    company = Company(
        public_id=str(uuid.uuid4()),
        name="Atelier Dupont",
        slug=f"atelier-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    session.add(company)
    session.flush()
    service = Service(company_id=company.id, name="Peinture", slug="peinture", is_active=True)
    session.add(service)
    session.flush()
    session.add(
        ServiceZone(company_id=company.id, label="Paris 16e", postal_code="75016", is_active=True)
    )
    item = PriceItem(
        company_id=company.id,
        service_id=service.id,
        label="Peinture murs",
        unit="m2",
        unit_price=Decimal("45"),
        is_active=True,
    )
    session.add(item)
    session.commit()
    public_id, item_id, company_id = company.public_id, item.id, company.id
    session.close()
    return public_id, item_id, company_id


def test_conversation_donne_un_devis(env, monkeypatch):
    TestingSession, client = env
    public_id, item_id, company_id = _seed(TestingSession)

    def fake_extract(**kwargs):
        return ExtractionResult(
            service_slug="peinture",
            postal_code="75016",
            customer=ExtractedCustomer(first_name="Alice", email="alice@example.fr"),
            items=[ExtractedLineItem(price_item_id=str(item_id), quantity=24)],
        )

    monkeypatch.setattr(extractor, "extract", fake_extract)

    resp = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": public_id, "message": "Repeindre 24 m² à Paris 16e"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["outcome"] == "quote"
    # 45 * 24 = 1080 HT, +20 % = 1296 TTC.
    assert body["quote"]["subtotal"] == 1080.0
    assert body["quote"]["total"] == 1296.0
    assert len(body["quote"]["lines"]) == 1

    # Le devis est persisté avec sa ligne rattachée au poste de la grille.
    check = TestingSession()
    quote = check.scalar(select(Quote).where(Quote.company_id == company_id))
    assert quote is not None
    assert quote.customer_email == "alice@example.fr"
    assert quote.lines[0].price_item_id == item_id
    check.close()


def test_hors_zone_donne_un_lead(env, monkeypatch):
    TestingSession, client = env
    public_id, item_id, company_id = _seed(TestingSession)

    def fake_extract(**kwargs):
        return ExtractionResult(
            service_slug="peinture",
            postal_code="13001",  # hors zone desservie
            customer=ExtractedCustomer(first_name="Bob", phone="0600000000"),
            items=[ExtractedLineItem(price_item_id=str(item_id), quantity=10)],
        )

    monkeypatch.setattr(extractor, "extract", fake_extract)

    resp = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": public_id, "message": "Repeindre à Marseille"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["outcome"] == "lead"
    assert body["lead_reason"] == "out_of_zone"

    check = TestingSession()
    lead = check.scalar(select(Lead).where(Lead.company_id == company_id))
    assert lead is not None and lead.reason == "out_of_zone"
    assert check.scalar(select(Quote).where(Quote.company_id == company_id)) is None
    check.close()


def test_entreprise_inconnue_renvoie_404(env):
    _TestingSession, client = env
    resp = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": str(uuid.uuid4()), "message": "Bonjour"},
    )
    assert resp.status_code == 404


def test_quota_atteint_donne_un_lead(env, monkeypatch):
    TestingSession, client = env
    public_id, item_id, company_id = _seed(TestingSession)

    # Sature le quota du plan gratuit (10 devis ce mois-ci).
    session = TestingSession()
    for i in range(10):
        session.add(Quote(
            company_id=company_id,
            reference=f"DEV-QUOTA-{i:04d}",
            status="draft",
            subtotal=Decimal("100.00"),
            tax_rate=Decimal("20"),
            total=Decimal("120.00"),
        ))
    session.commit()
    session.close()

    def fake_extract(**kwargs):
        return ExtractionResult(
            service_slug="peinture",
            postal_code="75016",
            customer=ExtractedCustomer(first_name="Chloé", email="chloe@example.fr"),
            items=[ExtractedLineItem(price_item_id=str(item_id), quantity=12)],
        )

    monkeypatch.setattr(extractor, "extract", fake_extract)

    resp = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": public_id, "message": "Repeindre 12 m² à Paris 16e"},
    )
    assert resp.status_code == 200
    body = resp.json()
    # La demande chiffrable devient un lead, sans exposer la raison au prospect.
    assert body["outcome"] == "lead"
    assert body["lead_reason"] == "quota_exceeded"
    assert "quota" not in body["message"].lower()

    check = TestingSession()
    lead = check.scalar(select(Lead).where(Lead.company_id == company_id))
    assert lead is not None and lead.reason == "quota_exceeded"
    # Aucun 11e devis créé.
    quotes = check.scalars(select(Quote).where(Quote.company_id == company_id)).all()
    assert len(quotes) == 10
    check.close()
