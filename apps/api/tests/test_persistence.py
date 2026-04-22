import asyncio
import json
import os
import unittest
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import UploadFile

from app.api.routes.schema_templates import create_schema_template, list_schema_templates
from app.api.routes.upload_mapping import get_normalized_upload, normalize_upload, save_upload_mapping
from app.api.routes.uploads import create_upload
from app.db.connection import Database
from app.db.schema import DatabaseSchemaManager
from app.mapping_definitions.service import MappingDefinitionService
from app.normalization.db_repository import DatabaseNormalizedUploadRepository
from app.parsing.service import UploadParsingService
from app.projects.db_repository import DatabaseProjectRepository
from app.projects.schemas import ProjectStatus, ProjectWrite
from app.schema_templates.db_repository import DatabaseSchemaTemplateRepository
from app.schema_templates.schemas import SchemaTemplateWrite
from app.upload_mappings.db_repository import DatabaseUploadMappingRepository
from app.upload_mappings.schemas import UploadMappingWrite
from app.uploads.db_repository import DatabaseUploadRepository
from app.uploads.schemas import DataType
from app.uploads.storage import LocalUploadStorage


@unittest.skipUnless(
    os.getenv("DATABASE_URL"),
    "DATABASE_URL is required for database-backed persistence tests.",
)
class DatabasePersistenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.database = Database(os.environ["DATABASE_URL"])
        cls.schema_manager = DatabaseSchemaManager(cls.database)
        cls.schema_manager.initialize()

    def setUp(self) -> None:
        self.schema_manager.reset_for_tests()
        self.temp_dir = TemporaryDirectory()
        self.project_repository = DatabaseProjectRepository(self.database)
        self.upload_repository = DatabaseUploadRepository(self.database)
        self.schema_repository = DatabaseSchemaTemplateRepository(self.database)
        self.mapping_repository = DatabaseUploadMappingRepository(self.database)
        self.normalized_repository = DatabaseNormalizedUploadRepository(self.database)
        self.mapping_definition_service = MappingDefinitionService()
        self.parsing_service = UploadParsingService()
        self.upload_storage = LocalUploadStorage(Path(self.temp_dir.name))
        self.project = self.project_repository.create(
            ProjectWrite(
                project_code="NJDOT-DB-001",
                name="Database Persistence Pilot",
                client_name="NJDOT",
                route="I-287",
                roadway="Mainline",
                direction="NB",
                county="Morris",
                state="NJ",
                start_mp=10.5,
                end_mp=12.1,
                start_station="105+00",
                end_station="121+00",
                description="Persistence verification project.",
                status=ProjectStatus.ACTIVE,
            )
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _make_upload_file(self, filename: str, content: bytes) -> UploadFile:
        return UploadFile(filename=filename, file=BytesIO(content))

    def test_projects_uploads_and_templates_persist_across_repository_instances(self) -> None:
        create_schema_template(
            SchemaTemplateWrite(
                name="Persistent Vendor Layout",
                data_type=DataType.GPR,
                is_default=False,
                field_mappings={
                    "scan": "trace_number",
                    "distance": "distance_ft",
                    "interface_depth_1": "surface_depth",
                },
            ),
            self.schema_repository,
        )

        created_upload = asyncio.run(
            create_upload(
                project_id=self.project.id,
                data_type=DataType.GPR,
                notes="Database-backed upload.",
                file=self._make_upload_file(
                    "persistent-gpr.csv",
                    b"trace_number,distance_ft,surface_depth\n100,0,1.8\n",
                ),
                gpr_file_identifier="Lane 1",
                gpr_channel_count=1,
                gpr_channel_labels_json=json.dumps({}),
                gpr_interface_count=1,
                gpr_interface_labels_json=json.dumps({1: "Surface"}),
                project_repository=self.project_repository,
                upload_repository=self.upload_repository,
                upload_file_storage=self.upload_storage,
            )
        )

        fresh_project_repository = DatabaseProjectRepository(self.database)
        fresh_upload_repository = DatabaseUploadRepository(self.database)
        fresh_schema_repository = DatabaseSchemaTemplateRepository(self.database)

        loaded_project = fresh_project_repository.get(self.project.id)
        loaded_upload = fresh_upload_repository.get(created_upload.id)
        templates = list_schema_templates(DataType.GPR, fresh_schema_repository)

        self.assertIsNotNone(loaded_project)
        self.assertEqual(loaded_project.name, self.project.name)
        self.assertIsNotNone(loaded_upload)
        self.assertEqual(loaded_upload.filename, "persistent-gpr.csv")
        self.assertEqual(loaded_upload.gpr_import_config.file_identifier, "Lane 1")
        self.assertEqual(fresh_upload_repository.get_storage_path(created_upload.id), created_upload_storage_path := fresh_upload_repository.get_storage_path(created_upload.id))
        self.assertIsNotNone(created_upload_storage_path)
        self.assertTrue(any(template.name == "GPR Baseline" for template in templates))
        self.assertTrue(any(template.name == "Persistent Vendor Layout" for template in templates))

    def test_mappings_and_normalized_results_persist_across_repository_instances(self) -> None:
        created_upload = asyncio.run(
            create_upload(
                project_id=self.project.id,
                data_type=DataType.GPR,
                notes="Normalization persistence verification.",
                file=self._make_upload_file(
                    "normalize-gpr.csv",
                    (
                        b"scan_no,distance_ft,depth_surface,latitude,longitude,dielectric\n"
                        b"10,0,1.5,40.1,-74.2,5.2\n"
                        b"11,25,1.6,40.1005,-74.2005,\n"
                    ),
                ),
                gpr_file_identifier="Lane 2",
                gpr_channel_count=1,
                gpr_channel_labels_json=json.dumps({}),
                gpr_interface_count=1,
                gpr_interface_labels_json=json.dumps({1: "Surface"}),
                project_repository=self.project_repository,
                upload_repository=self.upload_repository,
                upload_file_storage=self.upload_storage,
            )
        )

        save_upload_mapping(
            created_upload.id,
            UploadMappingWrite(
                assignments=[
                    {"source_column": "scan_no", "canonical_field": "scan"},
                    {"source_column": "distance_ft", "canonical_field": "distance"},
                    {"source_column": "depth_surface", "canonical_field": "interface_depth_1"},
                    {"source_column": "latitude", "canonical_field": "latitude"},
                    {"source_column": "longitude", "canonical_field": "longitude"},
                ],
                custom_fields=[
                    {
                        "source_column": "dielectric",
                        "custom_field_name": "Dielectric",
                    }
                ],
            ),
            self.upload_repository,
            self.mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
        )

        normalize_upload(
            created_upload.id,
            self.upload_repository,
            self.mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
            self.normalized_repository,
        )

        fresh_upload_repository = DatabaseUploadRepository(self.database)
        fresh_mapping_repository = DatabaseUploadMappingRepository(self.database)
        fresh_normalized_repository = DatabaseNormalizedUploadRepository(self.database)

        persisted_mapping = fresh_mapping_repository.get(created_upload.id)
        default_result = get_normalized_upload(
            created_upload.id,
            0,
            0,
            fresh_upload_repository,
            fresh_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
            fresh_normalized_repository,
        )
        paged_result = get_normalized_upload(
            created_upload.id,
            1,
            0,
            fresh_upload_repository,
            fresh_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
            fresh_normalized_repository,
        )

        self.assertIsNotNone(persisted_mapping)
        self.assertTrue(persisted_mapping.is_saved)
        self.assertEqual(len(persisted_mapping.assignments), 5)
        self.assertEqual(len(persisted_mapping.custom_fields), 1)
        self.assertEqual(persisted_mapping.custom_fields[0].custom_field_name, "Dielectric")
        self.assertEqual(default_result.normalized_row_count, 2)
        self.assertEqual(default_result.rows, [])
        self.assertEqual(default_result.preview_rows[0].normalized_values.file_identifier, "Lane 2")
        self.assertEqual(default_result.preview_rows[0].custom_fields["Dielectric"], "5.2")
        self.assertEqual(paged_result.rows[0].normalized_values.scan, 10.0)
        self.assertEqual(paged_result.rows[0].normalized_values.distance, 0.0)
        self.assertEqual(paged_result.rows[0].custom_fields["Dielectric"], "5.2")
        self.assertEqual(
            paged_result.rows[0].normalized_values.interface_depths[0].interface_label,
            "Surface",
        )

    def test_blank_gpr_interface_depths_persist_as_null(self) -> None:
        created_upload = asyncio.run(
            create_upload(
                project_id=self.project.id,
                data_type=DataType.GPR,
                notes="Blank interface depth persistence verification.",
                file=self._make_upload_file(
                    "normalize-gpr-blank-depths.csv",
                    (
                        b"distance_ft,depth_surface,depth_base\n"
                        b"0,1.5,5.7\n"
                        b"25,1.6,\n"
                        b"50,,\n"
                    ),
                ),
                gpr_file_identifier="Lane 4",
                gpr_channel_count=1,
                gpr_channel_labels_json=json.dumps({}),
                gpr_interface_count=2,
                gpr_interface_labels_json=json.dumps({1: "Surface", 2: "Base"}),
                project_repository=self.project_repository,
                upload_repository=self.upload_repository,
                upload_file_storage=self.upload_storage,
            )
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
            self.mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
        )

        normalize_upload(
            created_upload.id,
            self.upload_repository,
            self.mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
            self.normalized_repository,
        )

        default_result = get_normalized_upload(
            created_upload.id,
            0,
            0,
            DatabaseUploadRepository(self.database),
            DatabaseUploadMappingRepository(self.database),
            self.mapping_definition_service,
            self.parsing_service,
            DatabaseNormalizedUploadRepository(self.database),
        )
        persisted_result = get_normalized_upload(
            created_upload.id,
            3,
            0,
            DatabaseUploadRepository(self.database),
            DatabaseUploadMappingRepository(self.database),
            self.mapping_definition_service,
            self.parsing_service,
            DatabaseNormalizedUploadRepository(self.database),
        )

        self.assertEqual(default_result.rows, [])
        self.assertEqual(persisted_result.normalized_row_count, 3)
        self.assertEqual(persisted_result.rows[0].normalized_values.interface_depths[0].depth, 1.5)
        self.assertEqual(persisted_result.rows[0].normalized_values.interface_depths[1].depth, 5.7)
        self.assertIsNone(persisted_result.rows[1].normalized_values.interface_depths[1].depth)
        self.assertIsNone(persisted_result.rows[2].normalized_values.interface_depths[0].depth)
        self.assertIsNone(persisted_result.rows[2].normalized_values.interface_depths[1].depth)


if __name__ == "__main__":
    unittest.main()
