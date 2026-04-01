import asyncio
import unittest
from io import BytesIO
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from app.api.routes.upload_mapping import (
    get_mapping_definitions,
    get_upload_mapping,
    get_upload_preview,
    save_upload_mapping,
    validate_upload_mapping,
)
from app.api.routes.schema_templates import create_schema_template, list_schema_templates
from app.api.routes.uploads import create_upload, list_project_uploads
from app.main import app
from app.mapping_definitions.service import MappingDefinitionService
from app.projects.repository import InMemoryProjectRepository
from app.projects.schemas import ProjectStatus, ProjectWrite
from app.schema_templates.repository import InMemorySchemaTemplateRepository
from app.schema_templates.schemas import SchemaTemplateWrite
from app.upload_mappings.repository import InMemoryUploadMappingRepository
from app.upload_mappings.schemas import UploadMappingWrite
from app.uploads.repository import InMemoryUploadRepository
from app.uploads.schemas import DataType, FileFormat


class UploadFoundationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.project_repository = InMemoryProjectRepository()
        self.upload_repository = InMemoryUploadRepository()
        self.schema_repository = InMemorySchemaTemplateRepository()
        self.mapping_definition_service = MappingDefinitionService()
        self.upload_mapping_repository = InMemoryUploadMappingRepository()
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

    def test_create_and_list_project_upload(self) -> None:
        upload_file = UploadFile(
            filename="gpr-profile.csv",
            file=BytesIO(b"segment_id,distance_ft\nA-1,25\n"),
        )

        created_upload = asyncio.run(
            create_upload(
                self.project.id,
                DataType.GPR,
                "Initial field upload.",
                upload_file,
                self.project_repository,
                self.upload_repository,
            )
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

    def test_upload_preview_and_mapping_definition_foundation(self) -> None:
        upload_file = UploadFile(
            filename="fwd-drop-data.xlsx",
            file=BytesIO(b"placeholder"),
        )
        created_upload = asyncio.run(
            create_upload(
                self.project.id,
                DataType.FWD,
                "FWD field drop set.",
                upload_file,
                self.project_repository,
                self.upload_repository,
            )
        )

        preview = get_upload_preview(
            created_upload.id,
            self.upload_repository,
            self.mapping_definition_service,
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
        )

        self.assertEqual(preview.upload.id, created_upload.id)
        self.assertGreaterEqual(len(preview.source_columns), 4)
        self.assertEqual(mapping_definition.data_type, DataType.FWD)
        self.assertTrue(any(field.required for field in mapping_definition.canonical_fields))
        self.assertFalse(mapping_state.is_saved)
        self.assertEqual(len(mapping_state.assignments), len(preview.source_columns))

    def test_save_and_validate_upload_mapping(self) -> None:
        upload_file = UploadFile(
            filename="core-data.csv",
            file=BytesIO(b"placeholder"),
        )
        created_upload = asyncio.run(
            create_upload(
                self.project.id,
                DataType.CORE,
                "Core sample import.",
                upload_file,
                self.project_repository,
                self.upload_repository,
            )
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
        )
        validation = validate_upload_mapping(
            created_upload.id,
            UploadMappingWrite(assignments=saved_mapping.assignments),
            self.upload_repository,
            self.mapping_definition_service,
        )

        self.assertTrue(saved_mapping.is_saved)
        self.assertEqual(saved_mapping.data_type, DataType.CORE)
        self.assertTrue(validation.is_valid)
        self.assertEqual(validation.required_field_count, 3)
        self.assertEqual(validation.satisfied_required_field_count, 3)

    def test_validation_flags_duplicate_assignments_and_unknown_format(self) -> None:
        upload_file = UploadFile(
            filename="dcp-notes.txt",
            file=BytesIO(b"placeholder"),
        )
        created_upload = asyncio.run(
            create_upload(
                self.project.id,
                DataType.DCP,
                "Unexpected vendor export.",
                upload_file,
                self.project_repository,
                self.upload_repository,
            )
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
        )

        self.assertFalse(validation.is_valid)
        issue_codes = {issue.code for issue in validation.issues}
        self.assertIn("unsupported_file_format", issue_codes)
        self.assertIn("duplicate_canonical_assignment", issue_codes)

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
                    "segment_id": "segment",
                    "scan_distance_ft": "offset_ft",
                    "dielectric": "epsilon_r",
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
        self.assertIn("/uploads/{upload_id}/mapping", paths)
        self.assertIn("/uploads/{upload_id}/validate-mapping", paths)


if __name__ == "__main__":
    unittest.main()
