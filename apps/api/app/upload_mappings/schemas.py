from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.uploads.schemas import DataType


class ColumnMappingAssignment(BaseModel):
    source_column: str = Field(..., min_length=1, max_length=255)
    canonical_field: str | None = Field(default=None, max_length=100)

    @field_validator("source_column")
    @classmethod
    def normalize_source_column(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Source column cannot be blank.")
        return normalized

    @field_validator("canonical_field")
    @classmethod
    def normalize_canonical_field(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class UploadMappingWrite(BaseModel):
    assignments: list[ColumnMappingAssignment] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_source_columns(self) -> "UploadMappingWrite":
        seen: set[str] = set()
        for assignment in self.assignments:
            if assignment.source_column in seen:
                raise ValueError(
                    f"Source column '{assignment.source_column}' appears more than once."
                )
            seen.add(assignment.source_column)
        return self


class UploadMappingState(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    upload_id: UUID
    project_id: UUID
    data_type: DataType
    assignments: list[ColumnMappingAssignment] = Field(default_factory=list)
    updated_at: datetime | None = None
    is_saved: bool = False


class ValidationSeverity(StrEnum):
    ERROR = "error"
    WARNING = "warning"


class MappingValidationIssue(BaseModel):
    code: str = Field(..., min_length=1, max_length=100)
    severity: ValidationSeverity
    message: str = Field(..., min_length=1, max_length=400)
    source_column: str | None = None
    canonical_field: str | None = None


class MappingValidationResult(BaseModel):
    upload_id: UUID
    data_type: DataType
    is_valid: bool
    issues: list[MappingValidationIssue] = Field(default_factory=list)
    mapped_field_count: int = 0
    required_field_count: int = 0
    satisfied_required_field_count: int = 0
