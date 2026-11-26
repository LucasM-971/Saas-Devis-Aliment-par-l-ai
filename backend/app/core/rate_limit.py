"""Rate limiting en mémoire (fenêtre glissante par IP et endpoint).

Mono-instance uniquement ; passer à Redis en multi-instances.
"""

import math
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.config import settings

# Au-delà, purge des clés expirées
_MAX_TRACKED_KEYS = 10_000


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        # Endpoints sync exécutés en threadpool
        self._lock = threading.Lock()

    # None si autorisé, sinon le délai avant réessai (secondes).
    def hit(self, key: str, now: float | None = None) -> float | None:
        if now is None:
            now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return self.window - (now - hits[0])
            hits.append(now)
            if len(self._hits) > _MAX_TRACKED_KEYS:
                self._sweep(now)
            return None

    def _sweep(self, now: float) -> None:
        expired = [
            key for key, hits in self._hits.items() if not hits or now - hits[-1] > self.window
        ]
        for key in expired:
            del self._hits[key]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


# Limiteurs par usage (scopes distincts : un abus du chat ne bloque pas le login).
CHAT_MESSAGE_LIMITER = SlidingWindowLimiter(limit=20, window_seconds=60)
CHAT_QUOTE_LIMITER = SlidingWindowLimiter(limit=5, window_seconds=60)
AUTH_LIMITER = SlidingWindowLimiter(limit=10, window_seconds=60)


def _client_ip(request: Request) -> str:
    # X-Forwarded-For seulement si TRUST_PROXY_HEADERS
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# Fabrique une dépendance FastAPI qui applique le limiteur donné.
def rate_limited(limiter: SlidingWindowLimiter):
    def dependency(request: Request) -> None:
        if not settings.rate_limit_enabled:
            return
        retry_after = limiter.hit(_client_ip(request))
        if retry_after is not None:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Trop de requêtes. Réessayez dans quelques instants.",
                headers={"Retry-After": str(max(1, math.ceil(retry_after)))},
            )

    return dependency


def reset_all_limiters() -> None:
    for limiter in (CHAT_MESSAGE_LIMITER, CHAT_QUOTE_LIMITER, AUTH_LIMITER):
        limiter.reset()
