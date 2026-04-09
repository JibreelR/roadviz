from __future__ import annotations

from uuid import UUID

from app.gpr_imports.service import (
    GprImportConfigurationError,
    GprImportService,
    interface_depth_field_key,
)
from app.mapping_definitions.service import MappingDefinitionService
from app.normalization.repository import NormalizedUploadRepository
from app.normalization.schemas import (
    CoreNormalizedRow,
    CoreNormalizedValues,
    DcpNormalizedRow,
    DcpNormalizedValues,
    FwdNormalizedRow,
    FwdNormalizedValues,
    GprNormalizedInterfaceDepth,
    GprNormalizedRow,
    GprNormalizedValues,
    NormalizationRunSummary,
    NormalizedResultSet,
    NormalizedUploadRow,
)
from app.parsing.service import UploadParsingService
from app.projects.schemas import utc_now
from app.upload_mappings.repository import UploadMappingRepository
from app.upload_mappings.schemas import UploadMappingState
from app.upload_mappings.service import UploadMappingService
from app.uploads.repository import UploadRepository
from app.uploads.schemas import DataType, Upload


class NormalizationError(Exception):
    """Raised when a stored upload cannot be normalized into canonical RoadViz rows."""


class UploadNormalizationService:
    """Apply saved mappings to parsed rows and produce canonical RoadViz records."""

    def __init__(
        self,
        definition_service: MappingDefinitionService,
        upload_repository: UploadRepository,
        upload_mapping_repository: UploadMappingRepository,
        parsing_service: UploadParsingService,
        normalized_upload_repository: NormalizedUploadRepository,
    ) -> None:
        self._definition_service = definition_service
        self._upload_repository = upload_repository
        self._upload_mapping_repository = upload_mapping_repository
        self._parsing_service = parsing_service
        self._normalized_upload_repository = normalized_upload_repository
        self._gpr_import_service = GprImportService()

    def normalize_upload(self, upload: Upload) -> NormalizationRunSummary:
        saved_mapping = self._upload_mapping_repository.get(upload.id)
        if saved_mapping is None or not saved_mapping.is_saved:
            raise NormalizationError(
                "A saved mapping is required before normalization can run for this upload."
            )

        validation = UploadMappingService(
            self._definition_service,
            self._upload_repository,
            self._parsing_service,
        ).validate_mapping(upload, saved_mapping)
        if not validation.is_valid:
            errors = [
                issue.message for issue in validation.issues if issue.severity.value == "error"
            ]
            detail = "; ".join(errors[:3]) or "Mapping validation failed for normalization."
            raise NormalizationError(detail)

        parsed_upload = self._parsing_service.parse_upload(
            upload,
            self._upload_repository.get_storage_path(upload.id),
        )
        rows = self._normalize_rows(upload, saved_mapping, parsed_upload.rows)
        result = NormalizedResultSet(
            upload_id=upload.id,
            data_type=upload.data_type,
            normalized_at=utc_now(),
            total_source_row_count=parsed_upload.row_count,
            normalized_row_count=len(rows),
            preview_rows=rows[:5],
            rows=rows,
        )
        saved_result = self._normalized_upload_repository.save(result)

        return NormalizationRunSummary(
            upload_id=saved_result.upload_id,
            data_type=saved_result.data_type,
            normalized_at=saved_result.normalized_at,
            total_source_row_count=saved_result.total_source_row_count,
            normalized_row_count=saved_result.normalized_row_count,
            preview_rows=saved_result.preview_rows,
        )

    def get_normalized_result(self, upload_id: UUID) -> NormalizedResultSet | None:
        return self._normalized_upload_repository.get(upload_id)

    def _normalize_rows(
        self,
        upload: Upload,
        mapping: UploadMappingState,
        parsed_rows: list[dict[str, str | None]],
    ) -> list[NormalizedUploadRow]:
        field_sources = {
            assignment.canonical_field: assignment.source_column
            for assignment in mapping.assignments
            if assignment.canonical_field is not None
        }

        normalized_rows: list[NormalizedUploadRow] = []
        for row_index, source_row in enumerate(parsed_rows, start=1):
            mapped_values = {
                field_key: source_row.get(source_column)
                for field_key, source_column in field_sources.items()
            }
            normalized_rows.append(
                self._normalize_row(
                    upload=upload,
                    row_index=row_index,
                    source_row=source_row,
                    mapped_values=mapped_values,
                )
            )

        return normalized_rows

    def _normalize_row(
        self,
        upload: Upload,
        row_index: int,
        source_row: dict[str, str | None],
        mapped_values: dict[str, str | None],
    ) -> NormalizedUploadRow:
        if upload.data_type == DataType.GPR:
            return self._normalize_gpr_row(
                upload=upload,
                row_index=row_index,
                source_row=source_row,
                mapped_values=mapped_values,
            )
        if upload.data_type == DataType.CORE:
            return CoreNormalizedRow(
                upload_id=upload.id,
                row_index=row_index,
                source_row=source_row,
                mapped_values=mapped_values,
                normalized_values=CoreNormalizedValues(
                    core_id=self._require_text(mapped_values, "core_id", row_index),
                    station=self._require_text(mapped_values, "station", row_index),
                    lane=self._optional_text(mapped_values, "lane"),
                    total_thickness_in=self._require_float(
                        mapped_values, "total_thickness_in", row_index
                    ),
                    surface_type=self._optional_text(mapped_values, "surface_type"),
                ),
            )
        if upload.data_type == DataType.FWD:
            return FwdNormalizedRow(
                upload_id=upload.id,
                row_index=row_index,
                source_row=source_row,
                mapped_values=mapped_values,
                normalized_values=FwdNormalizedValues(
                    test_id=self._require_text(mapped_values, "test_id", row_index),
                    station=self._require_text(mapped_values, "station", row_index),
                    drop_load_lb=self._require_float(mapped_values, "drop_load_lb", row_index),
                    d0_mils=self._require_float(mapped_values, "d0_mils", row_index),
                    surface_temp_f=self._optional_float(mapped_values, "surface_temp_f", row_index),
                ),
            )
        if upload.data_type == DataType.DCP:
            return DcpNormalizedRow(
                upload_id=upload.id,
                row_index=row_index,
                source_row=source_row,
                mapped_values=mapped_values,
                normalized_values=DcpNormalizedValues(
                    test_point_id=self._require_text(mapped_values, "test_point_id", row_index),
                    station=self._require_text(mapped_values, "station", row_index),
                    blow_count=self._require_int(mapped_values, "blow_count", row_index),
                    depth_mm=self._require_float(mapped_values, "depth_mm", row_index),
                    layer_note=self._optional_text(mapped_values, "layer_note"),
                ),
            )
        raise NormalizationError(
            f"Normalization for data type '{upload.data_type}' is not implemented."
        )

    def _normalize_gpr_row(
        self,
        upload: Upload,
        row_index: int,
        source_row: dict[str, str | None],
        mapped_values: dict[str, str | None],
    ) -> GprNormalizedRow:
        try:
            config = self._gpr_import_service.get_config(upload)
        except GprImportConfigurationError as exc:
            raise NormalizationError(str(exc)) from exc

        if config.channel_count == 1:
            channel_number = 1
        else:
            channel_number = self._require_int(mapped_values, "channel_number", row_index)

        mapped_channel_label = self._optional_text(mapped_values, "channel_label")
        channel_label = mapped_channel_label or config.default_channel_label(channel_number)
        interface_depths = [
            GprNormalizedInterfaceDepth(
                interface_number=interface_number,
                interface_label=config.interface_label(interface_number),
                depth=self._optional_float(
                    mapped_values,
                    interface_depth_field_key(interface_number),
                    row_index,
                ),
            )
            for interface_number in range(1, config.interface_count + 1)
        ]

        return GprNormalizedRow(
            upload_id=upload.id,
            row_index=row_index,
            source_row=source_row,
            mapped_values=mapped_values,
            normalized_values=GprNormalizedValues(
                file_identifier=config.file_identifier,
                scan=self._optional_float(mapped_values, "scan", row_index),
                distance=self._optional_float(mapped_values, "distance", row_index),
                channel_number=channel_number,
                channel_label=channel_label,
                latitude=self._optional_float(mapped_values, "latitude", row_index),
                longitude=self._optional_float(mapped_values, "longitude", row_index),
                interface_depths=interface_depths,
            ),
        )

    def _require_text(
        self,
        mapped_values: dict[str, str | None],
        field_key: str,
        row_index: int,
    ) -> str:
        value = self._optional_text(mapped_values, field_key)
        if value is None:
            raise NormalizationError(
                f"Row {row_index} is missing a value for required field '{field_key}'."
            )
        return value

    def _optional_text(
        self,
        mapped_values: dict[str, str | None],
        field_key: str,
    ) -> str | None:
        value = mapped_values.get(field_key)
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    def _require_float(
        self,
        mapped_values: dict[str, str | None],
        field_key: str,
        row_index: int,
    ) -> float:
        value = self._optional_text(mapped_values, field_key)
        if value is None:
            raise NormalizationError(
                f"Row {row_index} is missing a value for required field '{field_key}'."
            )
        try:
            return float(value)
        except ValueError as exc:
            raise NormalizationError(
                f"Row {row_index} field '{field_key}' must be numeric."
            ) from exc

    def _optional_float(
        self,
        mapped_values: dict[str, str | None],
        field_key: str,
        row_index: int,
    ) -> float | None:
        value = self._optional_text(mapped_values, field_key)
        if value is None:
            return None
        try:
            return float(value)
        except ValueError as exc:
            raise NormalizationError(
                f"Row {row_index} field '{field_key}' must be numeric."
            ) from exc

    def _require_int(
        self,
        mapped_values: dict[str, str | None],
        field_key: str,
        row_index: int,
    ) -> int:
        value = self._optional_text(mapped_values, field_key)
        if value is None:
            raise NormalizationError(
                f"Row {row_index} is missing a value for required field '{field_key}'."
            )
        try:
            return int(float(value))
        except ValueError as exc:
            raise NormalizationError(
                f"Row {row_index} field '{field_key}' must be an integer value."
            ) from exc
