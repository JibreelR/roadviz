from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, Request, status

from app.projects.repository import ProjectRepository
from app.projects.schemas import Project
from app.schema_templates.repository import SchemaTemplateRepository
from app.uploads.repository import UploadRepository


def get_project_repository(request: Request) -> ProjectRepository:
    return request.app.state.project_repository


def get_upload_repository(request: Request) -> UploadRepository:
    return request.app.state.upload_repository


def get_schema_template_repository(request: Request) -> SchemaTemplateRepository:
    return request.app.state.schema_template_repository


def read_project_or_404(project_id: UUID, repository: ProjectRepository) -> Project:
    project = repository.get(project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project
