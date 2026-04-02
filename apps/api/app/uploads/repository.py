from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from typing import Protocol
from uuid import UUID, uuid4

from app.projects.schemas import utc_now
from app.uploads.schemas import Upload, UploadWrite


class UploadRepository(Protocol):
    def create(self, upload_in: UploadWrite, storage_path: str) -> Upload: ...

    def list_by_project(self, project_id: UUID) -> list[Upload]: ...

    def get(self, upload_id: UUID) -> Upload | None: ...

    def get_storage_path(self, upload_id: UUID) -> str | None: ...


@dataclass
class _StoredUploadRecord:
    upload: Upload
    storage_path: str


class InMemoryUploadRepository:
    """Store upload records in memory until a database-backed layer is introduced."""

    def __init__(self) -> None:
        self._uploads: dict[UUID, _StoredUploadRecord] = {}
        self._lock = Lock()

    def create(self, upload_in: UploadWrite, storage_path: str) -> Upload:
        upload = Upload(
            id=uuid4(),
            uploaded_at=utc_now(),
            **upload_in.model_dump(),
        )

        with self._lock:
            self._uploads[upload.id] = _StoredUploadRecord(
                upload=upload,
                storage_path=storage_path,
            )

        return upload.model_copy(deep=True)

    def list_by_project(self, project_id: UUID) -> list[Upload]:
        with self._lock:
            uploads = [
                record.upload.model_copy(deep=True)
                for record in self._uploads.values()
                if record.upload.project_id == project_id
            ]

        return sorted(uploads, key=lambda upload: upload.uploaded_at, reverse=True)

    def get(self, upload_id: UUID) -> Upload | None:
        with self._lock:
            record = self._uploads.get(upload_id)

        if record is None:
            return None

        return record.upload.model_copy(deep=True)

    def get_storage_path(self, upload_id: UUID) -> str | None:
        with self._lock:
            record = self._uploads.get(upload_id)

        if record is None:
            return None

        return record.storage_path
