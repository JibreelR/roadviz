from __future__ import annotations

from typing import Any

from pydantic import BaseModel, TypeAdapter

from app.gpr_imports.schemas import GprImportConfig
from app.normalization.schemas import NormalizedUploadRow
from app.upload_mappings.schemas import ColumnMappingAssignment

_gpr_import_config_adapter = TypeAdapter(GprImportConfig)
_field_mappings_adapter = TypeAdapter(dict[str, str])
_mapping_assignments_adapter = TypeAdapter(list[ColumnMappingAssignment])
_normalized_rows_adapter = TypeAdapter(list[NormalizedUploadRow])


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
    return _mapping_assignments_adapter.validate_python(value)


def load_normalized_rows(value: Any) -> list[NormalizedUploadRow]:
    if value is None:
        return []
    return _normalized_rows_adapter.validate_python(value)

