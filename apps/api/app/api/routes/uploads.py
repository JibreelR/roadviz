from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import ValidationError

from app.api.dependencies import (
    get_project_repository,
    get_upload_file_storage,
    get_upload_repository,
    read_project_or_404,
)
from app.gpr_imports.schemas import GprImportConfig
from app.projects.repository import ProjectRepository
from app.uploads.repository import UploadRepository
from app.uploads.schemas import DataType, Upload, UploadWrite, detect_file_format
from app.uploads.storage import LocalUploadStorage

router = APIRouter(prefix="/projects/{project_id}/uploads", tags=["uploads"])


def _parse_label_json(value: str | None, field_name: str) -> dict[int, str]:
    if value is None or not value.strip():
        return {}

    try:
        parsed_value = json.loads(value)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{field_name} must be valid JSON.",
        ) from exc

    if not isinstance(parsed_value, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{field_name} must be a JSON object keyed by number.",
        )

    return parsed_value


def _build_gpr_import_config(
    data_type: DataType,
    file_identifier: str | None,
    channel_count: int | None,
    channel_labels_json: str | None,
    interface_count: int | None,
    interface_labels_json: str | None,
) -> GprImportConfig | None:
    if data_type != DataType.GPR:
        return None
    if file_identifier is None or not file_identifier.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="GPR uploads require a file identifier.",
        )
    if channel_count is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="GPR uploads require a channel count.",
        )
    if interface_count is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="GPR uploads require an interface count.",
        )

    try:
        return GprImportConfig(
            file_identifier=file_identifier,
            channel_count=channel_count,
            channel_labels=_parse_label_json(channel_labels_json, "Channel labels"),
            interface_count=interface_count,
            interface_labels=_parse_label_json(interface_labels_json, "Interface labels"),
        )
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=exc.errors()[0]["msg"],
        ) from exc


@router.post("", response_model=Upload, status_code=status.HTTP_201_CREATED)
async def create_upload(
    project_id: UUID,
    data_type: DataType = Form(...),
    notes: str | None = Form(default=None),
    file: UploadFile = File(...),
    gpr_file_identifier: str | None = Form(default=None),
    gpr_channel_count: int | None = Form(default=None),
    gpr_channel_labels_json: str | None = Form(default=None),
    gpr_interface_count: int | None = Form(default=None),
    gpr_interface_labels_json: str | None = Form(default=None),
    project_repository: ProjectRepository = Depends(get_project_repository),
    upload_repository: UploadRepository = Depends(get_upload_repository),
    upload_file_storage: LocalUploadStorage = Depends(get_upload_file_storage),
) -> Upload:
    read_project_or_404(project_id, project_repository)
    filename = file.filename or "uploaded-file"
    stored_file = await upload_file_storage.save(file, filename)
    gpr_import_config = _build_gpr_import_config(
        data_type=data_type,
        file_identifier=gpr_file_identifier,
        channel_count=gpr_channel_count,
        channel_labels_json=gpr_channel_labels_json,
        interface_count=gpr_interface_count,
        interface_labels_json=gpr_interface_labels_json,
    )

    try:
        upload_in = UploadWrite(
            project_id=project_id,
            filename=filename,
            data_type=data_type,
            file_format=detect_file_format(filename),
            notes=notes,
            gpr_import_config=gpr_import_config,
        )
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=exc.errors()[0]["msg"],
        ) from exc
    return upload_repository.create(upload_in, storage_path=stored_file.storage_path)


@router.get("", response_model=list[Upload])
def list_project_uploads(
    project_id: UUID,
    project_repository: ProjectRepository = Depends(get_project_repository),
    upload_repository: UploadRepository = Depends(get_upload_repository),
) -> list[Upload]:
    read_project_or_404(project_id, project_repository)
    return upload_repository.list_by_project(project_id)


@router.get("/downloads/{upload_id}", response_class=FileResponse, tags=["uploads"])
def download_upload(
    upload_id: UUID,
    upload_repository: UploadRepository = Depends(get_upload_repository),
) -> FileResponse:
    upload = upload_repository.get(upload_id)
    if upload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found.")

    storage_path = upload_repository.get_storage_path(upload_id)
    if storage_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stored upload file not found.",
        )

    source_file = Path(storage_path)
    if not source_file.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stored upload file not found.",
        )

    return FileResponse(path=source_file, filename=upload.filename)
