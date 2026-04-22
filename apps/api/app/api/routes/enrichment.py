from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies import (
    get_enrichment_repository,
    get_normalized_upload_repository,
    get_upload_repository,
    read_upload_or_404,
)
from app.enrichment.repository import EnrichmentRepository
from app.enrichment.schemas import (
    EnrichedResultSet,
    EnrichmentRequest,
    EnrichmentRunSummary,
    GprMovingAverageRequest,
    GprMovingAverageResultSet,
    GprMovingAverageResultSummary,
    LinearReferenceTieTable,
    LinearReferenceTieTableWrite,
)
from app.enrichment.service import EnrichmentError, LinearReferencingEnrichmentService
from app.normalization.repository import NormalizedUploadRepository
from app.uploads.repository import UploadRepository

router = APIRouter(tags=["enrichment"])


def _service(
    normalized_repository: NormalizedUploadRepository,
    enrichment_repository: EnrichmentRepository,
) -> LinearReferencingEnrichmentService:
    return LinearReferencingEnrichmentService(
        normalized_repository=normalized_repository,
        enrichment_repository=enrichment_repository,
    )


@router.get(
    "/uploads/{upload_id}/linear-reference-ties",
    response_model=LinearReferenceTieTable,
)
def get_linear_reference_ties(
    upload_id: UUID,
    upload_repository: UploadRepository = Depends(get_upload_repository),
    enrichment_repository: EnrichmentRepository = Depends(get_enrichment_repository),
) -> LinearReferenceTieTable:
    read_upload_or_404(upload_id, upload_repository)
    tie_table = enrichment_repository.get_tie_table(upload_id)
    if tie_table is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tie table not found.",
        )
    return tie_table


@router.put(
    "/uploads/{upload_id}/linear-reference-ties",
    response_model=LinearReferenceTieTable,
)
def save_linear_reference_ties(
    upload_id: UUID,
    tie_table_in: LinearReferenceTieTableWrite,
    upload_repository: UploadRepository = Depends(get_upload_repository),
    normalized_repository: NormalizedUploadRepository = Depends(
        get_normalized_upload_repository
    ),
    enrichment_repository: EnrichmentRepository = Depends(get_enrichment_repository),
) -> LinearReferenceTieTable:
    upload = read_upload_or_404(upload_id, upload_repository)
    try:
        return _service(normalized_repository, enrichment_repository).save_tie_table(
            upload,
            tie_table_in,
        )
    except EnrichmentError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.post(
    "/uploads/{upload_id}/enrich",
    response_model=EnrichmentRunSummary,
)
def enrich_upload(
    upload_id: UUID,
    enrichment_request: EnrichmentRequest | None = None,
    upload_repository: UploadRepository = Depends(get_upload_repository),
    normalized_repository: NormalizedUploadRepository = Depends(
        get_normalized_upload_repository
    ),
    enrichment_repository: EnrichmentRepository = Depends(get_enrichment_repository),
) -> EnrichmentRunSummary:
    upload = read_upload_or_404(upload_id, upload_repository)
    try:
        return _service(normalized_repository, enrichment_repository).apply_ties(
            upload,
            enrichment_request or EnrichmentRequest(),
        )
    except EnrichmentError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.get(
    "/uploads/{upload_id}/enriched",
    response_model=EnrichedResultSet,
)
def get_enriched_upload(
    upload_id: UUID,
    limit: int = Query(default=0, ge=0, le=500),
    offset: int = Query(default=0, ge=0),
    upload_repository: UploadRepository = Depends(get_upload_repository),
    normalized_repository: NormalizedUploadRepository = Depends(
        get_normalized_upload_repository
    ),
    enrichment_repository: EnrichmentRepository = Depends(get_enrichment_repository),
) -> EnrichedResultSet:
    read_upload_or_404(upload_id, upload_repository)
    result = _service(normalized_repository, enrichment_repository).get_enriched_result(
        upload_id,
        limit=limit,
        offset=offset,
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enriched results not found. Apply ties for this upload first.",
        )
    return result


@router.post(
    "/uploads/{upload_id}/analyses/gpr/moving-average",
    response_model=GprMovingAverageResultSummary,
)
def create_gpr_moving_average(
    upload_id: UUID,
    request: GprMovingAverageRequest,
    upload_repository: UploadRepository = Depends(get_upload_repository),
    normalized_repository: NormalizedUploadRepository = Depends(
        get_normalized_upload_repository
    ),
    enrichment_repository: EnrichmentRepository = Depends(get_enrichment_repository),
) -> GprMovingAverageResultSummary:
    upload = read_upload_or_404(upload_id, upload_repository)
    try:
        result = _service(
            normalized_repository,
            enrichment_repository,
        ).create_gpr_moving_average(upload, request)
    except EnrichmentError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return GprMovingAverageResultSummary.model_validate(result.model_dump(mode="json"))


@router.get(
    "/uploads/{upload_id}/analyses/gpr/moving-average/{analysis_id}",
    response_model=GprMovingAverageResultSet,
)
def get_gpr_moving_average(
    upload_id: UUID,
    analysis_id: UUID,
    limit: int = Query(default=0, ge=0, le=1000),
    offset: int = Query(default=0, ge=0),
    upload_repository: UploadRepository = Depends(get_upload_repository),
    normalized_repository: NormalizedUploadRepository = Depends(
        get_normalized_upload_repository
    ),
    enrichment_repository: EnrichmentRepository = Depends(get_enrichment_repository),
) -> GprMovingAverageResultSet:
    read_upload_or_404(upload_id, upload_repository)
    result = _service(
        normalized_repository,
        enrichment_repository,
    ).get_moving_average_result(
        upload_id,
        analysis_id,
        limit=limit,
        offset=offset,
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Moving-average result not found.",
        )
    return result
