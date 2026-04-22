import asyncio
import json
import unittest
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from openpyxl import Workbook

from app.api.routes.upload_mapping import (
    get_mapping_definitions,
    get_normalized_upload,
    get_upload_mapping_definition,
    get_upload_mapping,
    get_upload_preview,
    normalize_upload,
    save_upload_mapping,
    validate_upload_mapping,
)
from app.api.routes.schema_templates import create_schema_template, list_schema_templates
from app.api.routes.uploads import create_upload, list_project_uploads
from app.main import app
from app.mapping_definitions.service import MappingDefinitionService
from app.normalization.repository import InMemoryNormalizedUploadRepository
from app.parsing.service import UploadParsingService
from app.projects.repository import InMemoryProjectRepository
from app.projects.schemas import ProjectStatus, ProjectWrite
from app.schema_templates.repository import InMemorySchemaTemplateRepository
from app.schema_templates.schemas import SchemaTemplateWrite
from app.upload_mappings.repository import InMemoryUploadMappingRepository
from app.upload_mappings.schemas import UploadMappingWrite
from app.uploads.repository import InMemoryUploadRepository
from app.uploads.schemas import DataType, FileFormat
from app.uploads.storage import LocalUploadStorage


class UploadFoundationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.project_repository = InMemoryProjectRepository()
        self.upload_repository = InMemoryUploadRepository()
        self.schema_repository = InMemorySchemaTemplateRepository()
        self.mapping_definition_service = MappingDefinitionService()
        self.parsing_service = UploadParsingService()
        self.upload_mapping_repository = InMemoryUploadMappingRepository()
        self.normalized_upload_repository = InMemoryNormalizedUploadRepository()
        self.upload_file_storage = LocalUploadStorage(Path(self.temp_dir.name))
        self.project = self.project_repository.create(
            ProjectWrite(
                project_code="NJDOT-002",
                name="Route 46 Upload Pilot",
                client_name="NJDOT",
                route="US-46",
                roadway="Mainline",
                direction="WB",
                county="Passaic",
                state="NJ",
                start_mp=1.2,
                end_mp=4.7,
                start_station="012+00",
                end_station="047+00",
                description="Pilot upload workflow project.",
                status=ProjectStatus.ACTIVE,
            )
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _make_upload_file(self, filename: str, content: bytes) -> UploadFile:
        return UploadFile(filename=filename, file=BytesIO(content))

    def _make_xlsx_file(self, headers: list[str], rows: list[list[object]]) -> bytes:
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.append(headers)
        for row in rows:
            worksheet.append(row)

        stream = BytesIO()
        workbook.save(stream)
        workbook.close()
        return stream.getvalue()

    def _default_gpr_config(
        self,
        *,
        file_identifier: str = "Lane 1",
        channel_count: int = 1,
        channel_labels: dict[int, str] | None = None,
        interface_count: int = 1,
        interface_labels: dict[int, str] | None = None,
    ) -> dict[str, object]:
        return {
            "file_identifier": file_identifier,
            "channel_count": channel_count,
            "channel_labels": channel_labels or {},
            "interface_count": interface_count,
            "interface_labels": interface_labels or {},
        }

    def _create_upload(
        self,
        *,
        data_type: DataType,
        filename: str,
        content: bytes,
        notes: str,
        gpr_config: dict[str, object] | None = None,
    ):
        upload_file = self._make_upload_file(filename, content)
        return asyncio.run(
            create_upload(
                project_id=self.project.id,
                data_type=data_type,
                notes=notes,
                file=upload_file,
                gpr_file_identifier=(
                    str(gpr_config["file_identifier"]) if gpr_config is not None else None
                ),
                gpr_channel_count=(
                    int(gpr_config["channel_count"]) if gpr_config is not None else None
                ),
                gpr_channel_labels_json=(
                    json.dumps(gpr_config.get("channel_labels", {}))
                    if gpr_config is not None
                    else None
                ),
                gpr_interface_count=(
                    int(gpr_config["interface_count"]) if gpr_config is not None else None
                ),
                gpr_interface_labels_json=(
                    json.dumps(gpr_config.get("interface_labels", {}))
                    if gpr_config is not None
                    else None
                ),
                project_repository=self.project_repository,
                upload_repository=self.upload_repository,
                upload_file_storage=self.upload_file_storage,
            )
        )

    def test_create_and_list_project_upload(self) -> None:
        created_upload = self._create_upload(
            data_type=DataType.GPR,
            filename="gpr-profile.csv",
            content=b"distance,interface_1\n25,3.4\n",
            notes="Initial field upload.",
            gpr_config=self._default_gpr_config(
                file_identifier="Lane 1",
                channel_count=1,
                interface_count=1,
            ),
        )
        uploads = list_project_uploads(
            self.project.id,
            self.project_repository,
            self.upload_repository,
        )

        self.assertEqual(len(uploads), 1)
        self.assertEqual(uploads[0].id, created_upload.id)
        self.assertEqual(uploads[0].filename, "gpr-profile.csv")
        self.assertEqual(uploads[0].file_format, FileFormat.CSV)
        self.assertEqual(uploads[0].data_type, DataType.GPR)
        self.assertEqual(uploads[0].gpr_import_config.file_identifier, "Lane 1")
        self.assertIsNotNone(self.upload_repository.get_storage_path(created_upload.id))

    def test_upload_preview_and_mapping_definition_foundation(self) -> None:
        created_upload = self._create_upload(
            data_type=DataType.FWD,
            filename="fwd-drop-data.xlsx",
            content=self._make_xlsx_file(
                ["drop_id", "sta", "load_lb", "sensor_0_mils", "temp_f"],
                [
                    ["FWD-201", "210+25", 9000, 14.8, 81],
                    ["FWD-202", "212+75", 9000, 15.1, 82],
                ],
            ),
            notes="FWD field drop set.",
        )

        preview = get_upload_preview(
            created_upload.id,
            self.upload_repository,
            self.mapping_definition_service,
            self.parsing_service,
        )
        mapping_definition = get_mapping_definitions(
            DataType.FWD,
            self.mapping_definition_service,
        )
        mapping_state = get_upload_mapping(
            created_upload.id,
            self.upload_repository,
            self.upload_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
        )

        self.assertEqual(preview.upload.id, created_upload.id)
        self.assertEqual(preview.preview_status, "parsed")
        self.assertEqual(preview.row_count, 2)
        self.assertEqual(preview.sample_rows[0]["drop_id"], "FWD-201")
        self.assertGreaterEqual(len(preview.source_columns), 5)
        self.assertEqual(mapping_definition.data_type, DataType.FWD)
        self.assertTrue(any(field.required for field in mapping_definition.canonical_fields))
        self.assertFalse(mapping_state.is_saved)
        self.assertEqual(len(mapping_state.assignments), len(preview.source_columns))

    def test_save_and_validate_upload_mapping(self) -> None:
        created_upload = self._create_upload(
            data_type=DataType.CORE,
            filename="core-data.csv",
            content=(
                b"sample_id,sta,lane_name,thickness_in,material\n"
                b"C-12,145+50,Outside,9.5,HMA over aggregate base\n"
                b"C-13,149+00,Outside,10.25,HMA over PCC\n"
            ),
            notes="Core sample import.",
        )

        saved_mapping = save_upload_mapping(
            created_upload.id,
            UploadMappingWrite(
                assignments=[
                    {"source_column": "sample_id", "canonical_field": "core_id"},
                    {"source_column": "sta", "canonical_field": "station"},
                    {
                        "source_column": "thickness_in",
                        "canonical_field": "total_thickness_in",
                    },
                    {"source_column": "lane_name", "canonical_field": "lane"},
                ]
            ),
            self.upload_repository,
            self.upload_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
        )
        validation = validate_upload_mapping(
            created_upload.id,
            UploadMappingWrite(assignments=saved_mapping.assignments),
            self.upload_repository,
            self.mapping_definition_service,
            self.parsing_service,
        )

        self.assertTrue(saved_mapping.is_saved)
        self.assertEqual(saved_mapping.data_type, DataType.CORE)
        self.assertTrue(validation.is_valid)
        self.assertEqual(validation.required_field_count, 3)
        self.assertEqual(validation.satisfied_required_field_count, 3)

    def test_validation_flags_duplicate_assignments_and_unknown_format(self) -> None:
        created_upload = self._create_upload(
            data_type=DataType.DCP,
            filename="dcp-notes.txt",
            content=(
                b"point_id,sta,blows,penetration_mm,material_note\n"
                b"DCP-07,305+20,5,42,Dense base layer\n"
            ),
            notes="Unexpected vendor export.",
        )

        validation = validate_upload_mapping(
            created_upload.id,
            UploadMappingWrite(
                assignments=[
                    {"source_column": "point_id", "canonical_field": "test_point_id"},
                    {"source_column": "sta", "canonical_field": "station"},
                    {"source_column": "blows", "canonical_field": "blow_count"},
                    {"source_column": "penetration_mm", "canonical_field": "depth_mm"},
                    {"source_column": "material_note", "canonical_field": "depth_mm"},
                ]
            ),
            self.upload_repository,
            self.mapping_definition_service,
            self.parsing_service,
        )

        self.assertFalse(validation.is_valid)
        issue_codes = {issue.code for issue in validation.issues}
        self.assertIn("unsupported_file_format", issue_codes)
        self.assertIn("duplicate_canonical_assignment", issue_codes)

    def test_gpr_normalization_returns_upload_metadata_and_interface_depths(self) -> None:
        created_upload = self._create_upload(
            data_type=DataType.GPR,
            filename="gpr-profile.csv",
            content=(
                b"scan_no,distance_ft,channel,depth_surface,depth_base,latitude,longitude\n"
                b"10,0,2,1.5,5.75,40.1000,-74.2000\n"
                b"11,25,2,1.6,5.90,40.1005,-74.2005\n"
            ),
            notes="GPR run for normalization.",
            gpr_config=self._default_gpr_config(
                file_identifier="Lane 2",
                channel_count=2,
                channel_labels={2: "Right Wheelpath"},
                interface_count=2,
                interface_labels={
                    1: "Asphalt Surface Course",
                    2: "Asphalt Base Course",
                },
            ),
        )
        save_upload_mapping(
            created_upload.id,
            UploadMappingWrite(
                assignments=[
                    {"source_column": "scan_no", "canonical_field": "scan"},
                    {"source_column": "distance_ft", "canonical_field": "distance"},
                    {"source_column": "channel", "canonical_field": "channel_number"},
                    {"source_column": "depth_surface", "canonical_field": "interface_depth_1"},
                    {"source_column": "depth_base", "canonical_field": "interface_depth_2"},
                    {"source_column": "latitude", "canonical_field": "latitude"},
                    {"source_column": "longitude", "canonical_field": "longitude"},
                ]
            ),
            self.upload_repository,
            self.upload_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
        )

        summary = normalize_upload(
            created_upload.id,
            self.upload_repository,
            self.upload_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
            self.normalized_upload_repository,
        )
        default_result = get_normalized_upload(
            created_upload.id,
            0,
            0,
            self.upload_repository,
            self.upload_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
            self.normalized_upload_repository,
        )
        paged_result = get_normalized_upload(
            created_upload.id,
            1,
            0,
            self.upload_repository,
            self.upload_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
            self.normalized_upload_repository,
        )

        self.assertEqual(summary.normalized_row_count, 2)
        self.assertEqual(default_result.rows, [])
        self.assertEqual(default_result.returned_row_count, 0)
        self.assertEqual(default_result.preview_rows[0].data_type, DataType.GPR)
        self.assertEqual(default_result.issue_summary.error_count, 0)
        self.assertGreaterEqual(default_result.issue_summary.warning_count, 0)
        self.assertEqual(paged_result.rows[0].data_type, DataType.GPR)
        self.assertEqual(paged_result.rows[0].normalized_values.file_identifier, "Lane 2")
        self.assertEqual(paged_result.rows[0].normalized_values.scan, 10.0)
        self.assertEqual(paged_result.rows[0].normalized_values.distance, 0.0)
        self.assertEqual(paged_result.rows[0].normalized_values.channel_number, 2)
        self.assertEqual(
            paged_result.rows[0].normalized_values.channel_label,
            "Right Wheelpath",
        )
        self.assertEqual(paged_result.rows[0].normalized_values.latitude, 40.1)
        self.assertEqual(paged_result.rows[0].normalized_values.longitude, -74.2)
        self.assertEqual(
            paged_result.rows[0].normalized_values.interface_depths[0].interface_label,
            "Asphalt Surface Course",
        )
        self.assertEqual(paged_result.rows[0].normalized_values.interface_depths[0].depth, 1.5)
        self.assertEqual(paged_result.rows[0].mapped_values["scan"], "10")
        self.assertEqual(paged_result.rows[0].mapped_values["distance"], "0")

    def test_gpr_dynamic_definition_requires_channel_mapping_and_warns_for_missing_gps(self) -> None:
        created_upload = self._create_upload(
            data_type=DataType.GPR,
            filename="gpr-multichannel.csv",
            content=(
                b"distance_ft,channel_id,depth_1,depth_2\n"
                b"0,1,1.2,5.3\n"
                b"25,2,1.4,5.6\n"
            ),
            notes="Multi-channel GPR import.",
            gpr_config=self._default_gpr_config(
                file_identifier="Aux Lane",
                channel_count=2,
                interface_count=2,
                interface_labels={
                    1: "Asphalt Surface Course",
                    2: "Asphalt Base Course",
                },
            ),
        )

        definition = get_upload_mapping_definition(
            created_upload.id,
            self.upload_repository,
            self.mapping_definition_service,
        )
        validation = validate_upload_mapping(
            created_upload.id,
            UploadMappingWrite(
                assignments=[
                    {"source_column": "depth_1", "canonical_field": "interface_depth_1"},
                    {"source_column": "depth_2", "canonical_field": "interface_depth_2"},
                ]
            ),
            self.upload_repository,
            self.mapping_definition_service,
            self.parsing_service,
        )

        required_fields = {
            field.key for field in definition.canonical_fields if field.required
        }
        issue_codes = {issue.code for issue in validation.issues}
        self.assertIn("channel_number", required_fields)
        self.assertIn("interface_depth_1", required_fields)
        self.assertIn("interface_depth_2", required_fields)
        self.assertFalse(validation.is_valid)
        self.assertIn("missing_channel_number_mapping", issue_codes)
        self.assertIn("missing_scan_or_distance_mapping", issue_codes)
        self.assertIn("gps_mapping_recommended", issue_codes)

    def test_single_channel_gpr_normalization_defaults_channel_number_and_label(self) -> None:
        created_upload = self._create_upload(
            data_type=DataType.GPR,
            filename="gpr-single-channel.csv",
            content=(
                b"distance,depth_surface\n"
                b"0,1.8\n"
                b"25,1.9\n"
            ),
            notes="Single-channel GPR import.",
            gpr_config=self._default_gpr_config(
                file_identifier="Ramp A",
                channel_count=1,
                interface_count=1,
                interface_labels={1: "Asphalt Total Thickness"},
            ),
        )
        save_upload_mapping(
            created_upload.id,
            UploadMappingWrite(
                assignments=[
                    {"source_column": "distance", "canonical_field": "distance"},
                    {
                        "source_column": "depth_surface",
                        "canonical_field": "interface_depth_1",
                    },
                ]
            ),
            self.upload_repository,
            self.upload_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
        )

        summary = normalize_upload(
            created_upload.id,
            self.upload_repository,
            self.upload_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
            self.normalized_upload_repository,
        )

        self.assertEqual(summary.normalized_row_count, 2)
        self.assertIsNone(summary.preview_rows[0].normalized_values.scan)
        self.assertEqual(summary.preview_rows[0].normalized_values.distance, 0.0)
        self.assertEqual(summary.preview_rows[0].normalized_values.channel_number, 1)
        self.assertEqual(summary.preview_rows[0].normalized_values.channel_label, "Channel 1")
        self.assertEqual(
            summary.preview_rows[0].normalized_values.interface_depths[0].interface_label,
            "Asphalt Total Thickness",
        )

    def test_gpr_validation_accepts_scan_without_distance(self) -> None:
        created_upload = self._create_upload(
            data_type=DataType.GPR,
            filename="gpr-scan-only.csv",
            content=(
                b"scan_no,depth_surface\n"
                b"100,1.8\n"
                b"101,1.9\n"
            ),
            notes="Scan-only GPR import.",
            gpr_config=self._default_gpr_config(
                file_identifier="Lane 1",
                channel_count=1,
                interface_count=1,
            ),
        )

        validation = validate_upload_mapping(
            created_upload.id,
            UploadMappingWrite(
                assignments=[
                    {"source_column": "scan_no", "canonical_field": "scan"},
                    {
                        "source_column": "depth_surface",
                        "canonical_field": "interface_depth_1",
                    },
                ]
            ),
            self.upload_repository,
            self.mapping_definition_service,
            self.parsing_service,
        )

        issue_codes = {issue.code for issue in validation.issues}
        self.assertTrue(validation.is_valid)
        self.assertNotIn("missing_scan_or_distance_mapping", issue_codes)

    def test_gpr_normalization_allows_blank_mapped_interface_depth_values(self) -> None:
        created_upload = self._create_upload(
            data_type=DataType.GPR,
            filename="gpr-blank-interface-values.csv",
            content=(
                b"distance_ft,depth_surface,depth_base\n"
                b"0,1.5,5.7\n"
                b"25,1.6,\n"
                b"50,,\n"
            ),
            notes="GPR import with partial interface values.",
            gpr_config=self._default_gpr_config(
                file_identifier="Lane 3",
                channel_count=1,
                interface_count=2,
                interface_labels={
                    1: "Surface",
                    2: "Base",
                },
            ),
        )
        save_upload_mapping(
            created_upload.id,
            UploadMappingWrite(
                assignments=[
                    {"source_column": "distance_ft", "canonical_field": "distance"},
                    {
                        "source_column": "depth_surface",
                        "canonical_field": "interface_depth_1",
                    },
                    {
                        "source_column": "depth_base",
                        "canonical_field": "interface_depth_2",
                    },
                ]
            ),
            self.upload_repository,
            self.upload_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
        )

        summary = normalize_upload(
            created_upload.id,
            self.upload_repository,
            self.upload_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
            self.normalized_upload_repository,
        )
        result = get_normalized_upload(
            created_upload.id,
            3,
            0,
            self.upload_repository,
            self.upload_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
            self.normalized_upload_repository,
        )

        self.assertEqual(summary.normalized_row_count, 3)
        default_result = get_normalized_upload(
            created_upload.id,
            0,
            0,
            self.upload_repository,
            self.upload_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
            self.normalized_upload_repository,
        )
        self.assertEqual(default_result.rows, [])
        self.assertEqual(result.rows[0].normalized_values.interface_depths[0].depth, 1.5)
        self.assertEqual(result.rows[0].normalized_values.interface_depths[1].depth, 5.7)
        self.assertEqual(result.rows[1].normalized_values.interface_depths[0].depth, 1.6)
        self.assertIsNone(result.rows[1].normalized_values.interface_depths[1].depth)
        self.assertIsNone(result.rows[2].normalized_values.interface_depths[0].depth)
        self.assertIsNone(result.rows[2].normalized_values.interface_depths[1].depth)

    def test_custom_fields_validate_and_normalize_separately(self) -> None:
        created_upload = self._create_upload(
            data_type=DataType.GPR,
            filename="gpr-extra-export-columns.csv",
            content=(
                b"distance_ft,depth_surface,dielectric,amplitude\n"
                b"0,1.5,5.2,12\n"
                b"25,1.6,,13\n"
            ),
            notes="GPR export with useful extra columns.",
            gpr_config=self._default_gpr_config(
                file_identifier="Lane 5",
                channel_count=1,
                interface_count=1,
                interface_labels={1: "Surface"},
            ),
        )
        saved_mapping = save_upload_mapping(
            created_upload.id,
            UploadMappingWrite(
                assignments=[
                    {"source_column": "distance_ft", "canonical_field": "distance"},
                    {
                        "source_column": "depth_surface",
                        "canonical_field": "interface_depth_1",
                    },
                ],
                custom_fields=[
                    {
                        "source_column": "dielectric",
                        "custom_field_name": "Dielectric",
                    },
                    {
                        "source_column": "amplitude",
                        "custom_field_name": "Amplitude",
                    },
                ],
            ),
            self.upload_repository,
            self.upload_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
        )

        validation = validate_upload_mapping(
            created_upload.id,
            UploadMappingWrite(
                assignments=saved_mapping.assignments,
                custom_fields=saved_mapping.custom_fields,
            ),
            self.upload_repository,
            self.mapping_definition_service,
            self.parsing_service,
        )
        summary = normalize_upload(
            created_upload.id,
            self.upload_repository,
            self.upload_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
            self.normalized_upload_repository,
        )
        result = get_normalized_upload(
            created_upload.id,
            2,
            0,
            self.upload_repository,
            self.upload_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
            self.normalized_upload_repository,
        )

        self.assertTrue(validation.is_valid)
        self.assertEqual(validation.custom_field_count, 2)
        self.assertFalse(
            any(
                issue.code == "unmapped_source_column"
                and issue.source_column in {"dielectric", "amplitude"}
                for issue in validation.issues
            )
        )
        self.assertEqual(summary.preview_rows[0].custom_fields["Dielectric"], "5.2")
        self.assertEqual(result.rows[0].custom_fields["Dielectric"], "5.2")
        self.assertEqual(result.rows[0].custom_fields["Amplitude"], "12")
        self.assertIsNone(result.rows[1].custom_fields["Dielectric"])
        self.assertEqual(result.rows[1].custom_fields["Amplitude"], "13")
        self.assertNotIn("Dielectric", result.rows[0].mapped_values)

    def test_custom_field_validation_flags_invalid_custom_rows(self) -> None:
        created_upload = self._create_upload(
            data_type=DataType.CORE,
            filename="core-extra-columns.csv",
            content=(
                b"sample_id,sta,thickness_in,lane_name,material,velocity,amplitude\n"
                b"C-22,145+50,9.5,Outside,HMA,4.2,11\n"
            ),
            notes="Core import with extra columns.",
        )

        validation = validate_upload_mapping(
            created_upload.id,
            UploadMappingWrite(
                assignments=[
                    {"source_column": "sample_id", "canonical_field": "core_id"},
                    {"source_column": "sta", "canonical_field": "station"},
                    {
                        "source_column": "thickness_in",
                        "canonical_field": "total_thickness_in",
                    },
                    {"source_column": "lane_name", "canonical_field": "lane"},
                ],
                custom_fields=[
                    {
                        "source_column": "lane_name",
                        "custom_field_name": "Lane Export",
                    },
                    {
                        "source_column": "material",
                        "custom_field_name": "Vendor Value",
                    },
                    {
                        "source_column": "velocity",
                        "custom_field_name": "vendor value",
                    },
                    {
                        "source_column": "material",
                        "custom_field_name": "Material Copy",
                    },
                    {
                        "source_column": "unknown_extra",
                        "custom_field_name": "Unknown Extra",
                    },
                    {"source_column": "amplitude"},
                    {"source_column": "velocity", "custom_field_name": "Velocity 2"},
                    {"source_column": "amplitude", "custom_field_name": "Amplitude 2"},
                    {"source_column": "material", "custom_field_name": "Material 2"},
                    {"source_column": "lane_name", "custom_field_name": "Lane 2"},
                    {"source_column": "sta", "custom_field_name": "Station Copy"},
                ],
            ),
            self.upload_repository,
            self.mapping_definition_service,
            self.parsing_service,
        )

        issue_codes = {issue.code for issue in validation.issues}
        self.assertFalse(validation.is_valid)
        self.assertIn("too_many_custom_fields", issue_codes)
        self.assertIn("duplicate_custom_field_name", issue_codes)
        self.assertIn("duplicate_custom_source_column", issue_codes)
        self.assertIn("unknown_custom_source_column", issue_codes)
        self.assertIn("incomplete_custom_field", issue_codes)

    def test_gpr_upload_requires_import_metadata(self) -> None:
        upload_file = self._make_upload_file(
            "gpr-missing-config.csv",
            b"distance,interface_1\n0,4.2\n",
        )

        with self.assertRaises(HTTPException) as context:
            asyncio.run(
                create_upload(
                    project_id=self.project.id,
                    data_type=DataType.GPR,
                    notes="Missing GPR metadata.",
                    file=upload_file,
                    gpr_file_identifier=None,
                    gpr_channel_count=None,
                    gpr_channel_labels_json=None,
                    gpr_interface_count=None,
                    gpr_interface_labels_json=None,
                    project_repository=self.project_repository,
                    upload_repository=self.upload_repository,
                    upload_file_storage=self.upload_file_storage,
                )
            )

        self.assertEqual(context.exception.status_code, 422)
        self.assertIn("file identifier", context.exception.detail.lower())

    def test_invalid_xlsx_preview_returns_parse_error(self) -> None:
        created_upload = self._create_upload(
            data_type=DataType.FWD,
            filename="bad-fwd.xlsx",
            content=b"not-a-valid-workbook",
            notes="Broken workbook.",
        )

        with self.assertRaises(HTTPException) as context:
            get_upload_preview(
                created_upload.id,
                self.upload_repository,
                self.mapping_definition_service,
                self.parsing_service,
            )

        self.assertEqual(context.exception.status_code, 422)
        self.assertIn("XLSX parsing failed", context.exception.detail)

    def test_project_uploads_require_existing_project(self) -> None:
        with self.assertRaises(HTTPException) as context:
            list_project_uploads(
                uuid4(),
                self.project_repository,
                self.upload_repository,
            )

        self.assertEqual(context.exception.status_code, 404)
        self.assertEqual(context.exception.detail, "Project not found.")

    def test_default_and_custom_schema_templates(self) -> None:
        default_templates = list_schema_templates(None, self.schema_repository)
        self.assertGreaterEqual(len(default_templates), 4)

        created_template = create_schema_template(
            SchemaTemplateWrite(
                name="Custom GPR Vendor Layout",
                data_type=DataType.GPR,
                is_default=False,
                field_mappings={
                    "scan": "trace_number",
                    "distance": "offset_ft",
                    "interface_depth_1": "layer_1_depth",
                },
            ),
            self.schema_repository,
        )
        gpr_templates = list_schema_templates(DataType.GPR, self.schema_repository)

        self.assertEqual(created_template.data_type, DataType.GPR)
        self.assertTrue(any(template.id == created_template.id for template in gpr_templates))

    def test_upload_and_template_routes_registered(self) -> None:
        paths = {route.path for route in app.routes}
        self.assertIn("/projects/{project_id}/uploads", paths)
        self.assertIn("/schema-templates", paths)
        self.assertIn("/uploads/{upload_id}/preview", paths)
        self.assertIn("/mapping-definitions", paths)
        self.assertIn("/uploads/{upload_id}/mapping-definition", paths)
        self.assertIn("/uploads/{upload_id}/mapping", paths)
        self.assertIn("/uploads/{upload_id}/validate-mapping", paths)
        self.assertIn("/uploads/{upload_id}/normalize", paths)
        self.assertIn("/uploads/{upload_id}/normalized", paths)
        self.assertIn("/uploads/{upload_id}/linear-reference-ties", paths)
        self.assertIn("/uploads/{upload_id}/enrich", paths)
        self.assertIn("/uploads/{upload_id}/enriched", paths)
        self.assertIn("/uploads/{upload_id}/analyses/gpr/moving-average", paths)


if __name__ == "__main__":
    unittest.main()
