from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile, status

from app.api.dependencies import (
    get_project_repository,
    get_upload_repository,
    read_project_or_404,
)
from app.projects.repository import ProjectRepository
from app.uploads.repository import UploadRepository
from app.uploads.schemas import DataType, Upload, UploadWrite, detect_file_format

router = APIRouter(prefix="/projects/{project_id}/uploads", tags=["uploads"])


@router.post("", response_model=Upload, status_code=status.HTTP_201_CREATED)
async def create_upload(
    project_id: UUID,
    data_type: DataType = Form(...),
    notes: str | None = Form(default=None),
    file: UploadFile = File(...),
    project_repository: ProjectRepository = Depends(get_project_repository),
    upload_repository: UploadRepository = Depends(get_upload_repository),
) -> Upload:
    read_project_or_404(project_id, project_repository)

    upload_in = UploadWrite(
        project_id=project_id,
        filename=file.filename or "uploaded-file",
        data_type=data_type,
        file_format=detect_file_format(file.filename or ""),
        notes=notes,
    )
    return upload_repository.create(upload_in)


@router.get("", response_model=list[Upload])
def list_project_uploads(
    project_id: UUID,
    project_repository: ProjectRepository = Depends(get_project_repository),
    upload_repository: UploadRepository = Depends(get_upload_repository),
) -> list[Upload]:
    read_project_or_404(project_id, project_repository)
    return upload_repository.list_by_project(project_id)
