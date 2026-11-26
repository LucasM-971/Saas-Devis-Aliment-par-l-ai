from app.services.eligibility import check_eligibility

SERVICES = ["peinture", "carrelage"]
ZONES = ["75016", "75015"]


def test_eligible():
    assert check_eligibility(
        service_slug="peinture",
        postal_code="75016",
        supported_services=SERVICES,
        served_postal_codes=ZONES,
    ) == (True, None)


def test_unsupported_service():
    assert check_eligibility(
        service_slug="plomberie",
        postal_code="75016",
        supported_services=SERVICES,
        served_postal_codes=ZONES,
    ) == (False, "unsupported_service")


def test_out_of_zone():
    assert check_eligibility(
        service_slug="peinture",
        postal_code="13001",
        supported_services=SERVICES,
        served_postal_codes=ZONES,
    ) == (False, "out_of_zone")
