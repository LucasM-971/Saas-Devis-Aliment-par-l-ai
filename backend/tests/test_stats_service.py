from app.services.stats_service import compute_stats

QUOTES = [
    ("pending", 120.0),
    ("pending", 120.0),
    ("validated", 240.0),
    ("sent", 600.0),
    ("accepted", 1000.0),
    ("rejected", 1000.0),
]


def test_counts_and_potential_amount():
    stats = compute_stats(QUOTES)
    assert stats.demandesEnAttente == 2
    assert stats.pretAValider == 1
    assert stats.montantPotentiel == 1080  # 120 + 120 + 240 + 600 (hors accepté/refusé)


def test_completion_rate():
    assert compute_stats(QUOTES).tauxCompletion == 0.5  # 1 accepté / (1 accepté + 1 refusé)


def test_empty():
    stats = compute_stats([])
    assert stats.tauxCompletion == 0.0
    assert stats.montantPotentiel == 0
