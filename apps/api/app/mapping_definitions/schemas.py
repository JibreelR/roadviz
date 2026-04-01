from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field

from app.uploads.schemas import DataType, FileFormat


class CanonicalFieldCategory(StrEnum):
    IDENTIFIER = "identifier"
    LOCATION = "location"
    MEASUREMENT = "measurement"
    CONTEXT = "context"


class CanonicalFieldDefinition(BaseModel):
    key: str = Field(..., min_length=1, max_length=100)
    label: str = Field(..., min_length=1, max_length=120)
    description: str = Field(..., min_length=1, max_length=400)
    required: bool = False
    allow_multiple: bool = False
    category: CanonicalFieldCategory
    example_source_headers: list[str] = Field(default_factory=list)


class MappingDefinition(BaseModel):
    data_type: DataType
    supported_file_formats: list[FileFormat] = Field(default_factory=list)
    canonical_fields: list[CanonicalFieldDefinition] = Field(default_factory=list)
