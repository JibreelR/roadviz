import asyncio
import json
import unittest
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import UploadFile

from app.api.routes.enrichment import (
    create_gpr_moving_average,
    enrich_upload,
    get_enriched_upload,
    get_gpr_moving_average,
    get_project_station_milepost_ties,
    get_upload_distance_station_ties,
    save_project_station_milepost_ties,
    save_upload_distance_station_ties,
)
from app.api.routes.upload_mapping import normalize_upload, save_upload_mapping
from app.api.routes.uploads import create_upload
from app.enrichment.repository import InMemoryEnrichmentRepository
from app.enrichment.schemas import (
    EnrichmentRequest,
    GprMovingAverageRequest,
    ProjectStationMilepostTieTableWrite,
    UploadDistanceStationTieTableWrite,
)
from app.main import app
from app.mapping_definitions.service import MappingDefinitionService
from app.normalization.repository import InMemoryNormalizedUploadRepository
from app.parsing.service import UploadParsingService
from app.projects.repository import InMemoryProjectRepository
from app.projects.schemas import ProjectStatus, ProjectWrite
from app.upload_mappings.repository import InMemoryUploadMappingRepository
from app.upload_mappings.schemas import UploadMappingWrite
from app.uploads.repository import InMemoryUploadRepository
from app.uploads.schemas import DataType
from app.uploads.storage import LocalUploadStorage


class EnrichmentFoundationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.project_repository = InMemoryProjectRepository()
        self.upload_repository = InMemoryUploadRepository()
        self.mapping_definition_service = MappingDefinitionService()
        self.parsing_service = UploadParsingService()
        self.upload_mapping_repository = InMemoryUploadMappingRepository()
        self.normalized_repository = InMemoryNormalizedUploadRepository()
        self.enrichment_repository = InMemoryEnrichmentRepository()
        self.upload_file_storage = LocalUploadStorage(Path(self.temp_dir.name))
        self.project = self.project_repository.create(
            ProjectWrite(
                project_code="NJDOT-LRS-001",
                name="Linear Referencing Pilot",
                client_name="NJDOT",
                route="NJ-23",
                roadway="Mainline",
                direction="NB",
                county="Passaic",
                state="NJ",
                start_mp=10.0,
                end_mp=11.0,
                start_station="100+00",
                end_station="152+80",
                description="Tie-table enrichment verification.",
                status=ProjectStatus.ACTIVE,
            )
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _make_upload_file(self, filename: str, content: bytes) -> UploadFile:
        return UploadFile(filename=filename, file=BytesIO(content))

    def _create_normalized_gpr_upload(self):
        created_upload = asyncio.run(
            create_upload(
                project_id=self.project.id,
                data_type=DataType.GPR,
                notes="GPR enrichment source.",
                file=self._make_upload_file(
                    "gpr-enrichment.csv",
                    (
                        b"scan_no,distance_ft,depth_surface\n"
                        b"10,0,1.0\n"
                        b"11,50,3.0\n"
                        b"12,100,5.0\n"
                    ),
                ),
                gpr_file_identifier="Lane 1",
                gpr_channel_count=1,
                gpr_channel_labels_json=json.dumps({}),
                gpr_interface_count=1,
                gpr_interface_labels_json=json.dumps({1: "Surface"}),
                project_repository=self.project_repository,
                upload_repository=self.upload_repository,
                upload_file_storage=self.upload_file_storage,
            )
        )
        save_upload_mapping(
            created_upload.id,
            UploadMappingWrite(
                assignments=[
                    {"source_column": "scan_no", "canonical_field": "scan"},
                    {"source_column": "distance_ft", "canonical_field": "distance"},
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
        normalize_upload(
            created_upload.id,
            self.upload_repository,
            self.upload_mapping_repository,
            self.mapping_definition_service,
            self.parsing_service,
            self.normalized_repository,
        )
        return created_upload

    def test_ties_enrich_rows_and_gpr_moving_average_outputs_plot_ready_points(self) -> None:
        created_upload = self._create_normalized_gpr_upload()

        saved_project_ties = save_project_station_milepost_ties(
            project_id=self.project.id,
            tie_table_in=ProjectStationMilepostTieTableWrite(
                rows=[
                    {"station": "100+00", "milepost": 10.0},
                    {"station": "101+00", "milepost": 10.02},
                ]
            ),
            project_repository=self.project_repository,
            normalized_repository=self.normalized_repository,
            enrichment_repository=self.enrichment_repository,
        )
        saved_upload_ties = save_upload_distance_station_ties(
            upload_id=created_upload.id,
            tie_table_in=UploadDistanceStationTieTableWrite(
                rows=[
                    {"distance": 0, "station": "100+00"},
                    {"distance": 100, "station": "101+00"},
                ]
            ),
            upload_repository=self.upload_repository,
            normalized_repository=self.normalized_repository,
            enrichment_repository=self.enrichment_repository,
        )
        loaded_project_ties = get_project_station_milepost_ties(
            project_id=self.project.id,
            project_repository=self.project_repository,
            enrichment_repository=self.enrichment_repository,
        )
        loaded_upload_ties = get_upload_distance_station_ties(
            upload_id=created_upload.id,
            upload_repository=self.upload_repository,
            enrichment_repository=self.enrichment_repository,
        )
        enrichment_summary = enrich_upload(
            upload_id=created_upload.id,
            enrichment_request=EnrichmentRequest(),
            upload_repository=self.upload_repository,
            normalized_repository=self.normalized_repository,
            enrichment_repository=self.enrichment_repository,
        )
        enriched_result = get_enriched_upload(
            upload_id=created_upload.id,
            limit=3,
            offset=0,
            upload_repository=self.upload_repository,
            normalized_repository=self.normalized_repository,
            enrichment_repository=self.enrichment_repository,
        )
        moving_average_summary = create_gpr_moving_average(
            upload_id=created_upload.id,
            request=GprMovingAverageRequest(
                field_key="interface_depth_1",
                window_distance=100,
            ),
            upload_repository=self.upload_repository,
            normalized_repository=self.normalized_repository,
            enrichment_repository=self.enrichment_repository,
        )
        moving_average_result = get_gpr_moving_average(
            upload_id=created_upload.id,
            analysis_id=moving_average_summary.id,
            limit=3,
            offset=0,
            upload_repository=self.upload_repository,
            normalized_repository=self.normalized_repository,
            enrichment_repository=self.enrichment_repository,
        )

        self.assertEqual(saved_project_ties.rows[0].station_value, 10000)
        self.assertEqual(saved_upload_ties.rows[1].station_value, 10100)
        self.assertEqual(loaded_project_ties.rows[1].milepost, 10.02)
        self.assertEqual(loaded_upload_ties.rows[0].distance, 0)
        self.assertEqual(enrichment_summary.normalized_row_count, 3)
        self.assertEqual(enrichment_summary.enriched_row_count, 3)
        self.assertEqual(enrichment_summary.skipped_row_count, 0)
        self.assertEqual(enriched_result.rows[1].derived_station, "100+50.00")
        self.assertAlmostEqual(enriched_result.rows[1].derived_milepost, 10.01)
        self.assertEqual(enriched_result.rows[1].linear_reference_method, "interpolated")
        self.assertEqual(enriched_result.rows[1].normalized_row.row_index, 2)
        self.assertEqual(moving_average_summary.field_label, "Surface")
        self.assertEqual(moving_average_result.point_count, 3)
        self.assertEqual(
            [point.moving_average for point in moving_average_result.points],
            [2.0, 3.0, 4.0],
        )
        self.assertEqual(moving_average_result.points[1].station, "100+50.00")
        self.assertEqual(moving_average_result.points[1].raw_value, 3.0)

    def test_enrichment_routes_registered(self) -> None:
        paths = {route.path for route in app.routes}
        self.assertIn("/projects/{project_id}/station-milepost-ties", paths)
        self.assertIn("/uploads/{upload_id}/distance-station-ties", paths)
        self.assertIn("/uploads/{upload_id}/enrich", paths)
        self.assertIn("/uploads/{upload_id}/enriched", paths)
        self.assertIn("/uploads/{upload_id}/analyses/gpr/moving-average", paths)
        self.assertIn(
            "/uploads/{upload_id}/analyses/gpr/moving-average/{analysis_id}",
            paths,
        )


if __name__ == "__main__":
    unittest.main()
