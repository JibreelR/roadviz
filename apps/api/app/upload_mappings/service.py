from __future__ import annotations

from collections import defaultdict

from app.mapping_definitions.service import MappingDefinitionService
from app.upload_mappings.schemas import (
    ColumnMappingAssignment,
    MappingValidationIssue,
    MappingValidationResult,
    UploadMappingState,
    UploadMappingWrite,
    ValidationSeverity,
)
from app.uploads.schemas import (
    DataType,
    PreviewStatus,
    SourceColumnPreview,
    Upload,
    UploadPreview,
)


_PREVIEW_SEEDS: dict[DataType, dict[str, object]] = {
    DataType.GPR: {
        "sample_rows": [
            {
                "segment": "GPR-1001",
                "offset_ft": "0",
                "epsilon_r": "6.8",
                "surface_temperature_f": "74.0",
                "travel_lane": "Lane 1",
            },
            {
                "segment": "GPR-1001",
                "offset_ft": "25",
                "epsilon_r": "7.0",
                "surface_temperature_f": "74.5",
                "travel_lane": "Lane 1",
            },
        ],
        "row_count_estimate": 248,
    },
    DataType.CORE: {
        "sample_rows": [
            {
                "sample_id": "C-12",
                "sta": "145+50",
                "lane_name": "Outside",
                "thickness_in": "9.5",
                "material": "HMA over aggregate base",
            },
            {
                "sample_id": "C-13",
                "sta": "149+00",
                "lane_name": "Outside",
                "thickness_in": "10.25",
                "material": "HMA over PCC",
            },
        ],
        "row_count_estimate": 16,
    },
    DataType.FWD: {
        "sample_rows": [
            {
                "drop_id": "FWD-201",
                "sta": "210+25",
                "load_lb": "9000",
                "sensor_0_mils": "14.8",
                "temp_f": "81",
            },
            {
                "drop_id": "FWD-202",
                "sta": "212+75",
                "load_lb": "9000",
                "sensor_0_mils": "15.1",
                "temp_f": "82",
            },
        ],
        "row_count_estimate": 74,
    },
    DataType.DCP: {
        "sample_rows": [
            {
                "point_id": "DCP-07",
                "sta": "305+20",
                "blows": "5",
                "penetration_mm": "42",
                "material_note": "Dense base layer",
            },
            {
                "point_id": "DCP-07",
                "sta": "305+20",
                "blows": "10",
                "penetration_mm": "79",
                "material_note": "Transition to subbase",
            },
        ],
        "row_count_estimate": 33,
    },
}


def _infer_column_type(values: list[str | None]) -> str:
    populated_values = [value for value in values if value not in {None, ""}]
    if not populated_values:
        return "text"

    for value in populated_values:
        try:
            float(value)
        except (TypeError, ValueError):
            return "text"

    return "number"


class UploadMappingService:
    """Build upload preview contracts and validate saved or pending mappings."""

    def __init__(self, definition_service: MappingDefinitionService) -> None:
        self._definition_service = definition_service

    def build_preview(self, upload: Upload) -> UploadPreview:
        seed = _PREVIEW_SEEDS[upload.data_type]
        raw_sample_rows = seed["sample_rows"]
        assert isinstance(raw_sample_rows, list)
        sample_rows = [
            {key: value for key, value in row.items()}
            for row in raw_sample_rows
            if isinstance(row, dict)
        ]
        column_names = list(sample_rows[0].keys()) if sample_rows else []

        source_columns = []
        for column_name in column_names:
            sample_values = [row.get(column_name) for row in sample_rows]
            source_columns.append(
                SourceColumnPreview(
                    name=column_name,
                    sample_values=sample_values[:3],
                    inferred_type=_infer_column_type(sample_values),
                )
            )

        row_count_estimate = seed["row_count_estimate"]
        assert row_count_estimate is None or isinstance(row_count_estimate, int)

        return UploadPreview(
            upload=upload.model_copy(deep=True),
            preview_status=PreviewStatus.STUBBED,
            source_columns=source_columns,
            sample_rows=sample_rows,
            row_count_estimate=row_count_estimate,
        )

    def build_mapping_state(
        self,
        upload: Upload,
        saved_mapping: UploadMappingState | None,
    ) -> UploadMappingState:
        preview = self.build_preview(upload)
        saved_by_source = {
            assignment.source_column: assignment
            for assignment in (saved_mapping.assignments if saved_mapping is not None else [])
        }

        assignments = [
            ColumnMappingAssignment(
                source_column=column.name,
                canonical_field=saved_by_source.get(column.name, None).canonical_field
                if column.name in saved_by_source
                else None,
            )
            for column in preview.source_columns
        ]

        preview_columns = {column.name for column in preview.source_columns}
        for assignment in saved_by_source.values():
            if assignment.source_column not in preview_columns:
                assignments.append(assignment.model_copy(deep=True))

        return UploadMappingState(
            upload_id=upload.id,
            project_id=upload.project_id,
            data_type=upload.data_type,
            assignments=assignments,
            updated_at=saved_mapping.updated_at if saved_mapping is not None else None,
            is_saved=saved_mapping is not None,
        )

    def validate_mapping(
        self,
        upload: Upload,
        mapping_in: UploadMappingWrite,
    ) -> MappingValidationResult:
        definition = self._definition_service.get_definition(upload.data_type)
        preview = self.build_preview(upload)
        issues: list[MappingValidationIssue] = []
        field_lookup = {field.key: field for field in definition.canonical_fields}
        assigned_by_canonical: dict[str, list[str]] = defaultdict(list)
        assignments_by_source = {
            assignment.source_column: assignment.canonical_field
            for assignment in mapping_in.assignments
        }
        preview_columns = {column.name for column in preview.source_columns}

        if upload.file_format not in definition.supported_file_formats:
            issues.append(
                MappingValidationIssue(
                    code="unsupported_file_format",
                    severity=ValidationSeverity.ERROR,
                    message=(
                        f"Upload format '{upload.file_format}' is not supported for "
                        f"{upload.data_type.upper()} mapping."
                    ),
                )
            )

        for assignment in mapping_in.assignments:
            if assignment.source_column not in preview_columns:
                issues.append(
                    MappingValidationIssue(
                        code="unknown_source_column",
                        severity=ValidationSeverity.ERROR,
                        message=(
                            f"Source column '{assignment.source_column}' is not available in "
                            "the current upload preview."
                        ),
                        source_column=assignment.source_column,
                    )
                )

            if assignment.canonical_field is None:
                continue

            if assignment.canonical_field not in field_lookup:
                issues.append(
                    MappingValidationIssue(
                        code="unknown_canonical_field",
                        severity=ValidationSeverity.ERROR,
                        message=(
                            f"Canonical field '{assignment.canonical_field}' does not belong to "
                            f"the {upload.data_type.upper()} definition set."
                        ),
                        source_column=assignment.source_column,
                        canonical_field=assignment.canonical_field,
                    )
                )
                continue

            assigned_by_canonical[assignment.canonical_field].append(assignment.source_column)

        for field in definition.canonical_fields:
            assigned_sources = assigned_by_canonical.get(field.key, [])
            if field.required and not assigned_sources:
                issues.append(
                    MappingValidationIssue(
                        code="missing_required_field",
                        severity=ValidationSeverity.ERROR,
                        message=f"Required canonical field '{field.label}' is not mapped.",
                        canonical_field=field.key,
                    )
                )
            if len(assigned_sources) > 1 and not field.allow_multiple:
                issues.append(
                    MappingValidationIssue(
                        code="duplicate_canonical_assignment",
                        severity=ValidationSeverity.ERROR,
                        message=f"Canonical field '{field.label}' can only be assigned once.",
                        canonical_field=field.key,
                    )
                )

        for column in preview.source_columns:
            if assignments_by_source.get(column.name) is None:
                issues.append(
                    MappingValidationIssue(
                        code="unmapped_source_column",
                        severity=ValidationSeverity.WARNING,
                        message=f"Source column '{column.name}' is not mapped yet.",
                        source_column=column.name,
                    )
                )

        required_field_count = sum(field.required for field in definition.canonical_fields)
        satisfied_required_field_count = sum(
            1
            for field in definition.canonical_fields
            if field.required and field.key in assigned_by_canonical
        )

        return MappingValidationResult(
            upload_id=upload.id,
            data_type=upload.data_type,
            is_valid=all(issue.severity != ValidationSeverity.ERROR for issue in issues),
            issues=issues,
            mapped_field_count=sum(
                1 for assignment in mapping_in.assignments if assignment.canonical_field is not None
            ),
            required_field_count=required_field_count,
            satisfied_required_field_count=satisfied_required_field_count,
        )
