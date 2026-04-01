from __future__ import annotations

from threading import Lock
from typing import Protocol
from uuid import UUID, uuid4

from app.projects.schemas import utc_now
from app.uploads.schemas import Upload, UploadWrite


class UploadRepository(Protocol):
    def create(self, upload_in: UploadWrite) -> Upload: ...

    def list_by_project(self, project_id: UUID) -> list[Upload]: ...


class InMemoryUploadRepository:
    """Store upload records in memory until a database-backed layer is introduced."""

    def __init__(self) -> None:
        self._uploads: dict[UUID, Upload] = {}
        self._lock = Lock()

    def create(self, upload_in: UploadWrite) -> Upload:
        upload = Upload(
            id=uuid4(),
            uploaded_at=utc_now(),
            **upload_in.model_dump(),
        )

        with self._lock:
            self._uploads[upload.id] = upload

        return upload.model_copy(deep=True)

    def list_by_project(self, project_id: UUID) -> list[Upload]:
        with self._lock:
            uploads = [
                upload.model_copy(deep=True)
                for upload in self._uploads.values()
                if upload.project_id == project_id
            ]

        return sorted(uploads, key=lambda upload: upload.uploaded_at, reverse=True)
