from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import (
    get_mapping_definition_service,
    get_normalized_upload_repository,
    get_upload_parsing_service,
    get_upload_mapping_repository,
    get_upload_repository,
    read_upload_or_404,
)
from app.gpr_imports.service import GprImportConfigurationError
from app.mapping_definitions.schemas import MappingDefinition
from app.mapping_definitions.service import MappingDefinitionService
from app.normalization.repository import NormalizedUploadRepository
from app.normalization.schemas import NormalizationRunSummary, NormalizedResultSet
from app.normalization.service import NormalizationError, UploadNormalizationService
from app.parsing.service import UploadParseError, UploadParsingService
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
    parsing_service: UploadParsingService = Depends(get_upload_parsing_service),
) -> UploadPreview:
    upload = read_upload_or_404(upload_id, upload_repository)
    mapping_service = UploadMappingService(
        definition_service,
        upload_repository,
        parsing_service,
    )
    try:
        return mapping_service.build_preview(upload)
    except UploadParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.get("/mapping-definitions", response_model=MappingDefinition)
def get_mapping_definitions(
    data_type: DataType,
    definition_service: MappingDefinitionService = Depends(get_mapping_definition_service),
) -> MappingDefinition:
    return definition_service.get_definition(data_type)


@router.get("/uploads/{upload_id}/mapping-definition", response_model=MappingDefinition)
def get_upload_mapping_definition(
    upload_id: UUID,
    upload_repository: UploadRepository = Depends(get_upload_repository),
    definition_service: MappingDefinitionService = Depends(get_mapping_definition_service),
) -> MappingDefinition:
    upload = read_upload_or_404(upload_id, upload_repository)
    try:
        return definition_service.get_definition_for_upload(upload)
    except GprImportConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.get("/uploads/{upload_id}/mapping", response_model=UploadMappingState)
def get_upload_mapping(
    upload_id: UUID,
    upload_repository: UploadRepository = Depends(get_upload_repository),
    upload_mapping_repository: UploadMappingRepository = Depends(get_upload_mapping_repository),
    definition_service: MappingDefinitionService = Depends(get_mapping_definition_service),
    parsing_service: UploadParsingService = Depends(get_upload_parsing_service),
) -> UploadMappingState:
    upload = read_upload_or_404(upload_id, upload_repository)
    saved_mapping = upload_mapping_repository.get(upload_id)
    mapping_service = UploadMappingService(
        definition_service,
        upload_repository,
        parsing_service,
    )
    try:
        return mapping_service.build_mapping_state(upload, saved_mapping)
    except UploadParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


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
    parsing_service: UploadParsingService = Depends(get_upload_parsing_service),
) -> UploadMappingState:
    upload = read_upload_or_404(upload_id, upload_repository)
    saved_mapping = upload_mapping_repository.upsert(
        upload_id=upload.id,
        project_id=upload.project_id,
        data_type=upload.data_type,
        mapping_in=mapping_in,
    )
    mapping_service = UploadMappingService(
        definition_service,
        upload_repository,
        parsing_service,
    )
    try:
        return mapping_service.build_mapping_state(upload, saved_mapping)
    except UploadParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


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
    parsing_service: UploadParsingService = Depends(get_upload_parsing_service),
) -> MappingValidationResult:
    upload = read_upload_or_404(upload_id, upload_repository)
    mapping_service = UploadMappingService(
        definition_service,
        upload_repository,
        parsing_service,
    )
    return mapping_service.validate_mapping(upload, mapping_in)


@router.post(
    "/uploads/{upload_id}/normalize",
    response_model=NormalizationRunSummary,
    status_code=status.HTTP_200_OK,
)
def normalize_upload(
    upload_id: UUID,
    upload_repository: UploadRepository = Depends(get_upload_repository),
    upload_mapping_repository: UploadMappingRepository = Depends(get_upload_mapping_repository),
    definition_service: MappingDefinitionService = Depends(get_mapping_definition_service),
    parsing_service: UploadParsingService = Depends(get_upload_parsing_service),
    normalized_upload_repository: NormalizedUploadRepository = Depends(
        get_normalized_upload_repository
    ),
) -> NormalizationRunSummary:
    upload = read_upload_or_404(upload_id, upload_repository)
    normalization_service = UploadNormalizationService(
        definition_service,
        upload_repository,
        upload_mapping_repository,
        parsing_service,
        normalized_upload_repository,
    )
    try:
        return normalization_service.normalize_upload(upload)
    except (NormalizationError, UploadParseError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.get(
    "/uploads/{upload_id}/normalized",
    response_model=NormalizedResultSet,
)
def get_normalized_upload(
    upload_id: UUID,
    upload_repository: UploadRepository = Depends(get_upload_repository),
    normalized_upload_repository: NormalizedUploadRepository = Depends(
        get_normalized_upload_repository
    ),
) -> NormalizedResultSet:
    read_upload_or_404(upload_id, upload_repository)
    normalized_result = normalized_upload_repository.get(upload_id)
    if normalized_result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Normalized results not found. Run normalization for this upload first.",
        )
    return normalized_result
