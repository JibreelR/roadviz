from __future__ import annotations

from threading import Lock
from typing import Protocol
from uuid import UUID

from app.projects.schemas import utc_now
from app.upload_mappings.schemas import UploadMappingState, UploadMappingWrite
from app.uploads.schemas import DataType


class UploadMappingRepository(Protocol):
    def get(self, upload_id: UUID) -> UploadMappingState | None: ...

    def upsert(
        self,
        upload_id: UUID,
        project_id: UUID,
        data_type: DataType,
        mapping_in: UploadMappingWrite,
    ) -> UploadMappingState: ...


class InMemoryUploadMappingRepository:
    """Persist upload-to-canonical mappings in memory until a database layer exists."""

    def __init__(self) -> None:
        self._mappings: dict[UUID, UploadMappingState] = {}
        self._lock = Lock()

    def get(self, upload_id: UUID) -> UploadMappingState | None:
        with self._lock:
            mapping = self._mappings.get(upload_id)

        if mapping is None:
            return None

        return mapping.model_copy(deep=True)

    def upsert(
        self,
        upload_id: UUID,
        project_id: UUID,
        data_type: DataType,
        mapping_in: UploadMappingWrite,
    ) -> UploadMappingState:
        mapping = UploadMappingState(
            upload_id=upload_id,
            project_id=project_id,
            data_type=data_type,
            assignments=[assignment.model_copy(deep=True) for assignment in mapping_in.assignments],
            updated_at=utc_now(),
            is_saved=True,
        )

        with self._lock:
            self._mappings[upload_id] = mapping

        return mapping.model_copy(deep=True)
