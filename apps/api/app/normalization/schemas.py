from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.upload_mappings.schemas import MappingValidationIssue
from app.uploads.schemas import DataType


class GprNormalizedInterfaceDepth(BaseModel):
    interface_number: int = Field(..., ge=1)
    interface_label: str
    depth: float | None = None


class GprNormalizedValues(BaseModel):
    file_identifier: str
    scan: float | None = None
    distance: float | None = None
    channel_number: int = Field(..., ge=1)
    channel_label: str
    latitude: float | None = None
    longitude: float | None = None
    interface_depths: list[GprNormalizedInterfaceDepth] = Field(default_factory=list)


class CoreNormalizedValues(BaseModel):
    core_id: str
    station: str
    lane: str | None = None
    total_thickness_in: float
    surface_type: str | None = None


class FwdNormalizedValues(BaseModel):
    test_id: str
    station: str
    drop_load_lb: float
    d0_mils: float
    surface_temp_f: float | None = None


class DcpNormalizedValues(BaseModel):
    test_point_id: str
    station: str
    blow_count: int
    depth_mm: float
    layer_note: str | None = None


class NormalizedRowBase(BaseModel):
    upload_id: UUID
    row_index: int = Field(..., ge=1)
    source_row: dict[str, str | None] = Field(default_factory=dict)
    mapped_values: dict[str, str | None] = Field(default_factory=dict)


class GprNormalizedRow(NormalizedRowBase):
    data_type: Literal[DataType.GPR] = DataType.GPR
    normalized_values: GprNormalizedValues


class CoreNormalizedRow(NormalizedRowBase):
    data_type: Literal[DataType.CORE] = DataType.CORE
    normalized_values: CoreNormalizedValues


class FwdNormalizedRow(NormalizedRowBase):
    data_type: Literal[DataType.FWD] = DataType.FWD
    normalized_values: FwdNormalizedValues


class DcpNormalizedRow(NormalizedRowBase):
    data_type: Literal[DataType.DCP] = DataType.DCP
    normalized_values: DcpNormalizedValues


NormalizedUploadRow = GprNormalizedRow | CoreNormalizedRow | FwdNormalizedRow | DcpNormalizedRow


class NormalizationRunSummary(BaseModel):
    upload_id: UUID
    data_type: DataType
    normalized_at: datetime
    total_source_row_count: int = Field(..., ge=0)
    normalized_row_count: int = Field(..., ge=0)
    preview_rows: list[NormalizedUploadRow] = Field(default_factory=list)


class NormalizedIssueSummary(BaseModel):
    error_count: int = Field(default=0, ge=0)
    warning_count: int = Field(default=0, ge=0)
    errors: list[MappingValidationIssue] = Field(default_factory=list)
    warnings: list[MappingValidationIssue] = Field(default_factory=list)


class NormalizedResultSet(NormalizationRunSummary):
    rows: list[NormalizedUploadRow] = Field(default_factory=list)
    rows_offset: int = Field(default=0, ge=0)
    rows_limit: int = Field(default=0, ge=0)
    returned_row_count: int = Field(default=0, ge=0)
    has_more_rows: bool = False
    issue_summary: NormalizedIssueSummary | None = None
