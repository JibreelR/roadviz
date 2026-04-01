from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.dependencies import (
    get_mapping_definition_service,
    get_upload_mapping_repository,
    get_upload_repository,
    read_upload_or_404,
)
from app.mapping_definitions.schemas import MappingDefinition
from app.mapping_definitions.service import MappingDefinitionService
from app.upload_mappings.repository import UploadMappingRepository
from app.upload_mappings.schemas import (
    MappingValidationResult,
    UploadMappingState,
    UploadMappingWrite,
)
from app.upload_mappings.service import UploadMappingService
from app.uploads.repository import UploadRepository
from app.uploads.schemas import DataType, UploadPreview

router = APIRouter(tags=["upload-mapping"])


@router.get("/uploads/{upload_id}/preview", response_model=UploadPreview)
def get_upload_preview(
    upload_id: UUID,
    upload_repository: UploadRepository = Depends(get_upload_repository),
    definition_service: MappingDefinitionService = Depends(get_mapping_definition_service),
) -> UploadPreview:
    upload = read_upload_or_404(upload_id, upload_repository)
    mapping_service = UploadMappingService(definition_service)
    return mapping_service.build_preview(upload)


@router.get("/mapping-definitions", response_model=MappingDefinition)
def get_mapping_definitions(
    data_type: DataType,
    definition_service: MappingDefinitionService = Depends(get_mapping_definition_service),
) -> MappingDefinition:
    return definition_service.get_definition(data_type)


@router.get("/uploads/{upload_id}/mapping", response_model=UploadMappingState)
def get_upload_mapping(
    upload_id: UUID,
    upload_repository: UploadRepository = Depends(get_upload_repository),
    upload_mapping_repository: UploadMappingRepository = Depends(get_upload_mapping_repository),
    definition_service: MappingDefinitionService = Depends(get_mapping_definition_service),
) -> UploadMappingState:
    upload = read_upload_or_404(upload_id, upload_repository)
    saved_mapping = upload_mapping_repository.get(upload_id)
    mapping_service = UploadMappingService(definition_service)
    return mapping_service.build_mapping_state(upload, saved_mapping)


@router.post(
    "/uploads/{upload_id}/mapping",
    response_model=UploadMappingState,
    status_code=status.HTTP_200_OK,
)
def save_upload_mapping(
    upload_id: UUID,
    mapping_in: UploadMappingWrite,
    upload_repository: UploadRepository = Depends(get_upload_repository),
    upload_mapping_repository: UploadMappingRepository = Depends(get_upload_mapping_repository),
    definition_service: MappingDefinitionService = Depends(get_mapping_definition_service),
) -> UploadMappingState:
    upload = read_upload_or_404(upload_id, upload_repository)
    saved_mapping = upload_mapping_repository.upsert(
        upload_id=upload.id,
        project_id=upload.project_id,
        data_type=upload.data_type,
        mapping_in=mapping_in,
    )
    mapping_service = UploadMappingService(definition_service)
    return mapping_service.build_mapping_state(upload, saved_mapping)


@router.post(
    "/uploads/{upload_id}/validate-mapping",
    response_model=MappingValidationResult,
    status_code=status.HTTP_200_OK,
)
def validate_upload_mapping(
    upload_id: UUID,
    mapping_in: UploadMappingWrite,
    upload_repository: UploadRepository = Depends(get_upload_repository),
    definition_service: MappingDefinitionService = Depends(get_mapping_definition_service),
) -> MappingValidationResult:
    upload = read_upload_or_404(upload_id, upload_repository)
    mapping_service = UploadMappingService(definition_service)
    return mapping_service.validate_mapping(upload, mapping_in)
