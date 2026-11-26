"""Feature flags par tier d'abonnement (source de vérité des gates premium).

Le front lit ces drapeaux via GET /api/v1/billing/plan et masque/verrouille l'UI ;
le serveur reste l'autorité : chaque endpoint gated revérifie ici.
Stripe étant gelé, le changement de plan est simulé (POST /billing/plan).
"""

from dataclasses import dataclass

# Nombre de devis créables par mois calendaire en plan gratuit.
FREE_MONTHLY_QUOTE_LIMIT = 10
# Nombre d'espaces entreprise possédés (rôle owner) en plan gratuit.
FREE_MAX_OWNED_COMPANIES = 1

# Drapeaux par plan. Chaque clé correspond à une gate serveur ET un verrou UI.
_FEATURES: dict[str, dict[str, bool]] = {
    "free": {
        "quote_customization": False,  # modèle de devis (logo, couleurs, mise en page)
        "unlimited_quotes": False,  # sinon FREE_MONTHLY_QUOTE_LIMIT devis / mois
        "multi_company": False,  # sinon FREE_MAX_OWNED_COMPANIES espace(s)
    },
    "premium": {
        "quote_customization": True,
        "unlimited_quotes": True,
        "multi_company": True,
    },
}


@dataclass(frozen=True)
class QuoteQuota:
    used: int
    limit: int | None  # None = illimité

    @property
    def exhausted(self) -> bool:
        return self.limit is not None and self.used >= self.limit


def plan_features(plan: str) -> dict[str, bool]:
    return dict(_FEATURES.get(plan, _FEATURES["free"]))


def has_feature(plan: str, feature: str) -> bool:
    return plan_features(plan).get(feature, False)


def monthly_quote_limit(plan: str) -> int | None:
    return None if has_feature(plan, "unlimited_quotes") else FREE_MONTHLY_QUOTE_LIMIT
