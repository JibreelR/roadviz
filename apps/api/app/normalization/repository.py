from __future__ import annotations

from threading import Lock
from typing import Protocol
from uuid import UUID

from app.normalization.schemas import NormalizedResultSet


class NormalizedUploadRepository(Protocol):
    def get(self, upload_id: UUID) -> NormalizedResultSet | None: ...

    def save(self, result: NormalizedResultSet) -> NormalizedResultSet: ...


class InMemoryNormalizedUploadRepository:
    """Retain normalized upload results in memory until persistent storage is introduced."""

    def __init__(self) -> None:
        self._results: dict[UUID, NormalizedResultSet] = {}
        self._lock = Lock()

    def get(self, upload_id: UUID) -> NormalizedResultSet | None:
        with self._lock:
            result = self._results.get(upload_id)

        if result is None:
            return None

        return result.model_copy(deep=True)

    def save(self, result: NormalizedResultSet) -> NormalizedResultSet:
        with self._lock:
            self._results[result.upload_id] = result.model_copy(deep=True)

        return result.model_copy(deep=True)
