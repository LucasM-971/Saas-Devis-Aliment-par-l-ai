"""Éligibilité d'une demande : prestation supportée et zone desservie."""

from collections.abc import Iterable

# (eligible, reason) — reason est None si éligible.
def check_eligibility(
    *,
    service_slug: str | None,
    postal_code: str | None,
    supported_services: Iterable[str],
    served_postal_codes: Iterable[str],
) -> tuple[bool, str | None]:
    if service_slug is None or service_slug not in set(supported_services):
        return False, "unsupported_service"
    if postal_code is None or postal_code not in set(served_postal_codes):
        return False, "out_of_zone"
    return True, None
