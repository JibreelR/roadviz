from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, Request, status

from app.enrichment.repository import EnrichmentRepository
from app.normalization.repository import NormalizedUploadRepository
from app.mapping_definitions.service import MappingDefinitionService
from app.parsing.service import UploadParsingService
from app.projects.repository import ProjectRepository
from app.projects.schemas import Project
from app.schema_templates.repository import SchemaTemplateRepository
from app.upload_mappings.repository import UploadMappingRepository
from app.uploads.repository import UploadRepository
from app.uploads.schemas import Upload
from app.uploads.storage import LocalUploadStorage


def get_project_repository(request: Request) -> ProjectRepository:
    return request.app.state.project_repository


def get_upload_repository(request: Request) -> UploadRepository:
    return request.app.state.upload_repository


def get_schema_template_repository(request: Request) -> SchemaTemplateRepository:
    return request.app.state.schema_template_repository


def get_mapping_definition_service(request: Request) -> MappingDefinitionService:
    return request.app.state.mapping_definition_service


def get_upload_parsing_service(request: Request) -> UploadParsingService:
    return request.app.state.upload_parsing_service


def get_upload_mapping_repository(request: Request) -> UploadMappingRepository:
    return request.app.state.upload_mapping_repository


def get_normalized_upload_repository(request: Request) -> NormalizedUploadRepository:
    return request.app.state.normalized_upload_repository


def get_enrichment_repository(request: Request) -> EnrichmentRepository:
    return request.app.state.enrichment_repository


def get_upload_file_storage(request: Request) -> LocalUploadStorage:
    return request.app.state.upload_file_storage


def read_project_or_404(project_id: UUID, repository: ProjectRepository) -> Project:
    project = repository.get(project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


def read_upload_or_404(upload_id: UUID, repository: UploadRepository) -> Upload:
    upload = repository.get(upload_id)
    if upload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found.")
    return upload
