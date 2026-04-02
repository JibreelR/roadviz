from __future__ import annotations

from collections import defaultdict

from app.gpr_imports.service import GprImportConfigurationError, GprImportService
from app.mapping_definitions.service import MappingDefinitionService
from app.parsing.service import UploadParseError, UploadParsingService
from app.upload_mappings.schemas import (
    ColumnMappingAssignment,
    MappingValidationIssue,
    MappingValidationResult,
    UploadMappingState,
    UploadMappingWrite,
    ValidationSeverity,
)
from app.uploads.repository import UploadRepository
from app.uploads.schemas import DataType, PreviewStatus, Upload, UploadPreview


class UploadMappingService:
    """Build upload preview contracts and validate saved or pending mappings."""

    def __init__(
        self,
        definition_service: MappingDefinitionService,
        upload_repository: UploadRepository,
        parsing_service: UploadParsingService,
    ) -> None:
        self._definition_service = definition_service
        self._upload_repository = upload_repository
        self._parsing_service = parsing_service
        self._gpr_import_service = GprImportService()

    def build_preview(self, upload: Upload) -> UploadPreview:
        parsed_upload = self._parse_upload(upload)
        return UploadPreview(
            upload=upload.model_copy(deep=True),
            preview_status=PreviewStatus.PARSED,
            source_columns=parsed_upload.source_columns,
            sample_rows=parsed_upload.sample_rows,
            row_count=parsed_upload.row_count,
            row_count_estimate=parsed_upload.row_count,
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
        mapping_in: UploadMappingWrite | UploadMappingState,
    ) -> MappingValidationResult:
        issues: list[MappingValidationIssue] = []
        assignments_by_source = {
            assignment.source_column: assignment.canonical_field
            for assignment in mapping_in.assignments
        }
        preview_columns: set[str] = set()
        assigned_by_canonical: dict[str, list[str]] = defaultdict(list)

        try:
            definition = self._definition_service.get_definition_for_upload(upload)
        except GprImportConfigurationError as exc:
            return MappingValidationResult(
                upload_id=upload.id,
                data_type=upload.data_type,
                is_valid=False,
                issues=[
                    MappingValidationIssue(
                        code="missing_gpr_import_config",
                        severity=ValidationSeverity.ERROR,
                        message=str(exc),
                    )
                ],
                mapped_field_count=sum(
                    1
                    for assignment in mapping_in.assignments
                    if assignment.canonical_field is not None
                ),
                required_field_count=0,
                satisfied_required_field_count=0,
            )

        field_lookup = {field.key: field for field in definition.canonical_fields}

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
        else:
            try:
                preview_columns = {
                    column.name for column in self.build_preview(upload).source_columns
                }
            except UploadParseError as exc:
                issues.append(
                    MappingValidationIssue(
                        code="file_parse_error",
                        severity=ValidationSeverity.ERROR,
                        message=str(exc),
                    )
                )

        for assignment in mapping_in.assignments:
            if preview_columns and assignment.source_column not in preview_columns:
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
                if upload.data_type == DataType.GPR and field.key == "channel_number":
                    issues.append(
                        MappingValidationIssue(
                            code="missing_channel_number_mapping",
                            severity=ValidationSeverity.ERROR,
                            message=(
                                "Multi-channel GPR uploads must map a Channel Number column."
                            ),
                            canonical_field=field.key,
                        )
                    )
                    continue
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

        if upload.data_type == DataType.GPR:
            self._append_gpr_scan_distance_validation(issues, assigned_by_canonical)
            self._append_gpr_warnings(
                upload,
                assigned_by_canonical,
                issues,
            )

        if preview_columns:
            for column_name in sorted(preview_columns):
                if assignments_by_source.get(column_name) is None:
                    issues.append(
                        MappingValidationIssue(
                            code="unmapped_source_column",
                            severity=ValidationSeverity.WARNING,
                            message=f"Source column '{column_name}' is not mapped yet.",
                            source_column=column_name,
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

    def _parse_upload(self, upload: Upload):
        return self._parsing_service.parse_upload(
            upload,
            self._upload_repository.get_storage_path(upload.id),
        )

    def _append_gpr_warnings(
        self,
        upload: Upload,
        assigned_by_canonical: dict[str, list[str]],
        issues: list[MappingValidationIssue],
    ) -> None:
        try:
            self._gpr_import_service.get_config(upload)
        except GprImportConfigurationError:
            return

        has_latitude = bool(assigned_by_canonical.get("latitude"))
        has_longitude = bool(assigned_by_canonical.get("longitude"))
        if has_latitude and has_longitude:
            return

        issues.append(
            MappingValidationIssue(
                code="gps_mapping_recommended",
                severity=ValidationSeverity.WARNING,
                message=(
                    "Latitude and longitude are not both mapped. Normalization can continue, "
                    "but current map display will be limited until GPS coordinates are available."
                ),
            )
        )

    def _append_gpr_scan_distance_validation(
        self,
        issues: list[MappingValidationIssue],
        assigned_by_canonical: dict[str, list[str]],
    ) -> None:
        has_scan = bool(assigned_by_canonical.get("scan"))
        has_distance = bool(assigned_by_canonical.get("distance"))
        if has_scan or has_distance:
            return

        issues.append(
            MappingValidationIssue(
                code="missing_scan_or_distance_mapping",
                severity=ValidationSeverity.ERROR,
                message=(
                    "GPR uploads must map at least one location field: Scan or Distance."
                ),
            )
        )
