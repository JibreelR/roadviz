from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.normalization.schemas import NormalizedUploadRow
from app.uploads.schemas import DataType


LinearReferenceMethod = Literal["exact", "interpolated", "extrapolated"]


class StationTieRowMixin(BaseModel):
    station: str = Field(..., min_length=1, max_length=100)

    @field_validator("station")
    @classmethod
    def normalize_station(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Station cannot be blank.")
        return normalized


class ProjectStationMilepostTieRowWrite(StationTieRowMixin):
    milepost: float


class ProjectStationMilepostTieRow(ProjectStationMilepostTieRowWrite):
    station_value: float


class ProjectStationMilepostTieTableWrite(BaseModel):
    rows: list[ProjectStationMilepostTieRowWrite] = Field(..., min_length=2)


class ProjectStationMilepostTieTable(BaseModel):
    project_id: UUID
    updated_at: datetime
    rows: list[ProjectStationMilepostTieRow] = Field(default_factory=list)


class UploadDistanceStationTieRowWrite(StationTieRowMixin):
    distance: float


class UploadDistanceStationTieRow(UploadDistanceStationTieRowWrite):
    station_value: float


class UploadDistanceStationTieTableWrite(BaseModel):
    rows: list[UploadDistanceStationTieRowWrite] = Field(..., min_length=2)


class UploadDistanceStationTieTable(BaseModel):
    upload_id: UUID
    project_id: UUID
    updated_at: datetime
    rows: list[UploadDistanceStationTieRow] = Field(default_factory=list)


# Backward-compatible names for the original upload-scoped tie endpoints.
LinearReferenceTieTableWrite = UploadDistanceStationTieTableWrite
LinearReferenceTieTable = UploadDistanceStationTieTable


class EnrichmentRequest(BaseModel):
    preview_row_count: int = Field(default=5, ge=1, le=50)


class EnrichedUploadRow(BaseModel):
    upload_id: UUID
    source_row_index: int = Field(..., ge=1)
    data_type: DataType
    normalized_row: NormalizedUploadRow
    distance: float
    derived_station: str
    derived_station_value: float
    derived_milepost: float
    linear_reference_method: LinearReferenceMethod


class EnrichmentRunSummary(BaseModel):
    upload_id: UUID
    data_type: DataType
    enriched_at: datetime
    normalized_row_count: int = Field(..., ge=0)
    enriched_row_count: int = Field(..., ge=0)
    skipped_row_count: int = Field(..., ge=0)
    preview_rows: list[EnrichedUploadRow] = Field(default_factory=list)


class EnrichedResultSet(EnrichmentRunSummary):
    rows: list[EnrichedUploadRow] = Field(default_factory=list)
    rows_offset: int = Field(default=0, ge=0)
    rows_limit: int = Field(default=0, ge=0)
    returned_row_count: int = Field(default=0, ge=0)
    has_more_rows: bool = False


class GprMovingAverageRequest(BaseModel):
    field_key: str = Field(..., pattern=r"^interface_depth_[1-9][0-9]*$")
    window_distance: float = Field(..., gt=0)
    channel_number: int | None = Field(default=None, ge=1)
    preview_point_count: int = Field(default=10, ge=1, le=100)


class GprMovingAveragePoint(BaseModel):
    source_row_index: int = Field(..., ge=1)
    distance: float
    scan: float | None = None
    channel_number: int = Field(..., ge=1)
    channel_label: str
    station: str
    station_value: float
    milepost: float
    raw_value: float
    moving_average: float


class GprMovingAverageResultSummary(BaseModel):
    id: UUID
    upload_id: UUID
    created_at: datetime
    field_key: str
    interface_number: int = Field(..., ge=1)
    field_label: str
    window_distance: float = Field(..., gt=0)
    channel_number: int | None = Field(default=None, ge=1)
    source_enriched_row_count: int = Field(..., ge=0)
    point_count: int = Field(..., ge=0)
    preview_points: list[GprMovingAveragePoint] = Field(default_factory=list)


class GprMovingAverageResultSet(GprMovingAverageResultSummary):
    points: list[GprMovingAveragePoint] = Field(default_factory=list)
    points_offset: int = Field(default=0, ge=0)
    points_limit: int = Field(default=0, ge=0)
    returned_point_count: int = Field(default=0, ge=0)
    has_more_points: bool = False
