from __future__ import annotations

from copy import deepcopy
from threading import Lock
from time import monotonic
from typing import Any, Callable, TypeVar


T = TypeVar("T")


_cache: dict[str, tuple[float, Any]] = {}
_lock = Lock()
_default_ttl_seconds = 0


def get_or_set(key: str, factory: Callable[[], T], ttl_seconds: int | None = None) -> T:
    ttl = ttl_seconds if ttl_seconds is not None else _default_ttl_seconds
    if ttl <= 0:
        return factory()

    now = monotonic()

    with _lock:
        cached = _cache.get(key)
        if cached and cached[0] > now:
            return deepcopy(cached[1])

    value = factory()

    with _lock:
        _cache[key] = (now + ttl, deepcopy(value))

    return value


def invalidate(prefix: str | None = None) -> None:
    with _lock:
        if prefix is None:
            _cache.clear()
            return

        keys_to_delete = [key for key in _cache if key.startswith(prefix)]
        for key in keys_to_delete:
            _cache.pop(key, None)
