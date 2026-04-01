from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from pathlib import Path
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

class DataType(StrEnum):
    GPR = "gpr"
    CORE = "core"
    FWD = "fwd"
    DCP = "dcp"


class FileFormat(StrEnum):
    CSV = "csv"
    XLSX = "xlsx"
    UNKNOWN = "unknown"


class UploadStatus(StrEnum):
    RECEIVED = "received"
    MAPPING_PENDING = "mapping_pending"
    PROCESSING = "processing"
    FAILED = "failed"


class PreviewStatus(StrEnum):
    STUBBED = "stubbed"
    PARSED = "parsed"


def detect_file_format(filename: str) -> FileFormat:
    extension = Path(filename).suffix.lower()
    if extension == ".csv":
        return FileFormat.CSV
    if extension in {".xlsx", ".xls", ".xlsm"}:
        return FileFormat.XLSX
    return FileFormat.UNKNOWN


class UploadWrite(BaseModel):
    project_id: UUID
    filename: str = Field(..., min_length=1, max_length=255)
    data_type: DataType
    file_format: FileFormat
    status: UploadStatus = UploadStatus.RECEIVED
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("filename")
    @classmethod
    def validate_filename(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Filename cannot be blank.")
        return normalized

    @field_validator("notes")
    @classmethod
    def normalize_notes(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class Upload(UploadWrite):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    uploaded_at: datetime


class SourceColumnPreview(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    sample_values: list[str | None] = Field(default_factory=list)
    inferred_type: str | None = Field(default=None, max_length=50)


class UploadPreview(BaseModel):
    upload: Upload
    preview_status: PreviewStatus
    source_columns: list[SourceColumnPreview] = Field(default_factory=list)
    sample_rows: list[dict[str, str | None]] = Field(default_factory=list)
    row_count_estimate: int | None = None
