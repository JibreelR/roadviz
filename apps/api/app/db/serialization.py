from __future__ import annotations

from typing import Any, TypedDict

from pydantic import BaseModel, TypeAdapter

from app.enrichment.schemas import (
    EnrichedUploadRow,
    GprMovingAveragePoint,
    ProjectStationMilepostTieRow,
    UploadDistanceStationTieRow,
)
from app.gpr_imports.schemas import GprImportConfig
from app.normalization.schemas import NormalizedUploadRow
from app.upload_mappings.schemas import (
    ColumnMappingAssignment,
    CustomFieldMapping,
    UploadMappingWrite,
)

_gpr_import_config_adapter = TypeAdapter(GprImportConfig)
_field_mappings_adapter = TypeAdapter(dict[str, str])
_mapping_assignments_adapter = TypeAdapter(list[ColumnMappingAssignment])
_custom_field_mappings_adapter = TypeAdapter(list[CustomFieldMapping])
_normalized_rows_adapter = TypeAdapter(list[NormalizedUploadRow])
_project_station_milepost_tie_rows_adapter = TypeAdapter(
    list[ProjectStationMilepostTieRow]
)
_upload_distance_station_tie_rows_adapter = TypeAdapter(
    list[UploadDistanceStationTieRow]
)
_enriched_rows_adapter = TypeAdapter(list[EnrichedUploadRow])
_gpr_moving_average_points_adapter = TypeAdapter(list[GprMovingAveragePoint])


class UploadMappingPayload(TypedDict):
    assignments: list[ColumnMappingAssignment]
    custom_fields: list[CustomFieldMapping]


def dump_model(model: BaseModel) -> dict[str, Any]:
    return model.model_dump(mode="json")


def dump_models(models: list[BaseModel]) -> list[dict[str, Any]]:
    return [dump_model(model) for model in models]


def load_gpr_import_config(value: Any) -> GprImportConfig | None:
    if value is None:
        return None
    return _gpr_import_config_adapter.validate_python(value)


def load_field_mappings(value: Any) -> dict[str, str]:
    if value is None:
        return {}
    return _field_mappings_adapter.validate_python(value)


def load_mapping_assignments(value: Any) -> list[ColumnMappingAssignment]:
    if value is None:
        return []
    if isinstance(value, dict):
        value = value.get("assignments", [])
    return _mapping_assignments_adapter.validate_python(value)


def dump_upload_mapping_payload(mapping: UploadMappingWrite) -> dict[str, Any]:
    return {
        "assignments": dump_models(mapping.assignments),
        "custom_fields": dump_models(mapping.custom_fields),
    }


def load_upload_mapping_payload(value: Any) -> UploadMappingPayload:
    if value is None:
        value = {}

    if isinstance(value, list):
        return {
            "assignments": _mapping_assignments_adapter.validate_python(value),
            "custom_fields": [],
        }

    assignments = value.get("assignments", []) if isinstance(value, dict) else []
    custom_fields = value.get("custom_fields", []) if isinstance(value, dict) else []
    return {
        "assignments": _mapping_assignments_adapter.validate_python(assignments),
        "custom_fields": _custom_field_mappings_adapter.validate_python(custom_fields),
    }


def load_normalized_rows(value: Any) -> list[NormalizedUploadRow]:
    if value is None:
        return []
    return _normalized_rows_adapter.validate_python(value)


def load_project_station_milepost_tie_rows(
    value: Any,
) -> list[ProjectStationMilepostTieRow]:
    if value is None:
        return []
    return _project_station_milepost_tie_rows_adapter.validate_python(value)


def load_upload_distance_station_tie_rows(
    value: Any,
) -> list[UploadDistanceStationTieRow]:
    if value is None:
        return []
    return _upload_distance_station_tie_rows_adapter.validate_python(value)


def load_enriched_rows(value: Any) -> list[EnrichedUploadRow]:
    if value is None:
        return []
    return _enriched_rows_adapter.validate_python(value)


def load_gpr_moving_average_points(value: Any) -> list[GprMovingAveragePoint]:
    if value is None:
        return []
    return _gpr_moving_average_points_adapter.validate_python(value)

