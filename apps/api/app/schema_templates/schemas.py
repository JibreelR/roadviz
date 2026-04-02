from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.uploads.schemas import DataType


class SchemaTemplateWrite(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    data_type: DataType
    is_default: bool = False
    field_mappings: dict[str, str] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Template name cannot be blank.")
        return normalized

    @field_validator("field_mappings")
    @classmethod
    def normalize_field_mappings(cls, value: dict[str, str]) -> dict[str, str]:
        normalized: dict[str, str] = {}
        for key, mapping in value.items():
            key_text = key.strip()
            mapping_text = mapping.strip()
            if not key_text or not mapping_text:
                raise ValueError("Field mapping keys and values cannot be blank.")
            normalized[key_text] = mapping_text
        return normalized


class SchemaTemplate(SchemaTemplateWrite):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


class SchemaTemplateSeed(BaseModel):
    name: str
    data_type: DataType
    field_mappings: dict[str, str]
    is_default: bool = True


def default_template_seeds() -> list[SchemaTemplateSeed]:
    return [
        SchemaTemplateSeed(
            name="GPR Baseline",
            data_type=DataType.GPR,
            field_mappings={
                "scan": "scan",
                "distance": "distance",
                "latitude": "latitude",
                "longitude": "longitude",
                "channel_number": "channel_number",
                "interface_depth_1": "interface_depth_1",
            },
        ),
        SchemaTemplateSeed(
            name="Core Baseline",
            data_type=DataType.CORE,
            field_mappings={
                "core_id": "core_id",
                "station": "station",
                "lane": "lane",
                "total_thickness_in": "total_thickness_in",
            },
        ),
        SchemaTemplateSeed(
            name="FWD Baseline",
            data_type=DataType.FWD,
            field_mappings={
                "test_id": "test_id",
                "station": "station",
                "drop_load_lb": "drop_load_lb",
                "d0_mils": "d0_mils",
            },
        ),
        SchemaTemplateSeed(
            name="DCP Baseline",
            data_type=DataType.DCP,
            field_mappings={
                "test_point_id": "test_point_id",
                "station": "station",
                "blow_count": "blow_count",
                "depth_mm": "depth_mm",
            },
        ),
    ]
