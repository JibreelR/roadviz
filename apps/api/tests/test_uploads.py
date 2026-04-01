import asyncio
import unittest
from io import BytesIO
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from app.api.routes.schema_templates import create_schema_template, list_schema_templates
from app.api.routes.uploads import create_upload, list_project_uploads
from app.main import app
from app.projects.repository import InMemoryProjectRepository
from app.projects.schemas import ProjectStatus, ProjectWrite
from app.schema_templates.repository import InMemorySchemaTemplateRepository
from app.schema_templates.schemas import SchemaTemplateWrite
from app.uploads.repository import InMemoryUploadRepository
from app.uploads.schemas import DataType, FileFormat


class UploadFoundationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.project_repository = InMemoryProjectRepository()
        self.upload_repository = InMemoryUploadRepository()
        self.schema_repository = InMemorySchemaTemplateRepository()
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


if __name__ == "__main__":
    unittest.main()
