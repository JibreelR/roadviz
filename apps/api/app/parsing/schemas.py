from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field

from app.uploads.schemas import FileFormat, SourceColumnPreview


class ParsedUploadResult(BaseModel):
    upload_id: UUID
    filename: str = Field(..., min_length=1, max_length=255)
    file_format: FileFormat
    source_columns: list[SourceColumnPreview] = Field(default_factory=list)
    sample_rows: list[dict[str, str | None]] = Field(default_factory=list)
    row_count: int = Field(default=0, ge=0)
    rows: list[dict[str, str | None]] = Field(default_factory=list)
