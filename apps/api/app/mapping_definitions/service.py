from __future__ import annotations

from app.gpr_imports.service import GprImportService
from app.mapping_definitions.schemas import (
    CanonicalFieldCategory,
    CanonicalFieldDefinition,
    MappingDefinition,
)
from app.uploads.schemas import DataType, FileFormat, Upload


def _build_definitions() -> dict[DataType, MappingDefinition]:
    return {
        DataType.GPR: MappingDefinition(
            data_type=DataType.GPR,
            supported_file_formats=[FileFormat.CSV, FileFormat.XLSX],
            canonical_fields=[
                CanonicalFieldDefinition(
                    key="scan",
                    label="Scan",
                    description="Optional scan index or trace number for the GPR row.",
                    category=CanonicalFieldCategory.LOCATION,
                    example_source_headers=["scan", "scan_no", "scan_number", "trace"],
                ),
                CanonicalFieldDefinition(
                    key="distance",
                    label="Distance",
                    description="Optional distance value for the GPR row, such as feet along the run.",
                    category=CanonicalFieldCategory.LOCATION,
                    example_source_headers=["distance", "distance_ft", "offset_ft", "chainage"],
                ),
                CanonicalFieldDefinition(
                    key="latitude",
                    label="Latitude",
                    description="Optional GPS latitude used for current map display workflows.",
                    category=CanonicalFieldCategory.LOCATION,
                    example_source_headers=["lat", "latitude", "gps_lat"],
                ),
                CanonicalFieldDefinition(
                    key="longitude",
                    label="Longitude",
                    description="Optional GPS longitude used for current map display workflows.",
                    category=CanonicalFieldCategory.LOCATION,
                    example_source_headers=["lon", "lng", "longitude", "gps_lon"],
                ),
                CanonicalFieldDefinition(
                    key="channel_number",
                    label="Channel Number",
                    description="Channel number for multi-channel long-format GPR rows.",
                    category=CanonicalFieldCategory.CONTEXT,
                    example_source_headers=["channel", "channel_number", "antenna"],
                ),
                CanonicalFieldDefinition(
                    key="channel_label",
                    label="Channel Label",
                    description="Optional channel label when the source file includes it explicitly.",
                    category=CanonicalFieldCategory.CONTEXT,
                    example_source_headers=["channel_label", "lane_label"],
                ),
                CanonicalFieldDefinition(
                    key="interface_depth_1",
                    label="Interface 1 Depth",
                    description="Absolute depth to the first interpreted GPR interface.",
                    required=True,
                    category=CanonicalFieldCategory.MEASUREMENT,
                    example_source_headers=["interface_1", "depth_1", "layer_1"],
                ),
            ],
        ),
        DataType.CORE: MappingDefinition(
            data_type=DataType.CORE,
            supported_file_formats=[FileFormat.CSV, FileFormat.XLSX],
            canonical_fields=[
                CanonicalFieldDefinition(
                    key="core_id",
                    label="Core ID",
                    description="Unique identifier for each pavement core sample.",
                    required=True,
                    category=CanonicalFieldCategory.IDENTIFIER,
                    example_source_headers=["core_id", "sample_id"],
                ),
                CanonicalFieldDefinition(
                    key="station",
                    label="Station",
                    description="Station or chainage where the core was taken.",
                    required=True,
                    category=CanonicalFieldCategory.LOCATION,
                    example_source_headers=["station", "sta"],
                ),
                CanonicalFieldDefinition(
                    key="lane",
                    label="Lane",
                    description="Lane designation for the core location.",
                    category=CanonicalFieldCategory.CONTEXT,
                    example_source_headers=["lane", "lane_name"],
                ),
                CanonicalFieldDefinition(
                    key="total_thickness_in",
                    label="Total Thickness (in)",
                    description="Total measured asphalt or pavement thickness for the core.",
                    required=True,
                    category=CanonicalFieldCategory.MEASUREMENT,
                    example_source_headers=["total_thickness_in", "thickness_in"],
                ),
                CanonicalFieldDefinition(
                    key="surface_type",
                    label="Surface Type",
                    description="Material or surface description observed at the core location.",
                    category=CanonicalFieldCategory.CONTEXT,
                    example_source_headers=["surface_type", "material"],
                ),
            ],
        ),
        DataType.FWD: MappingDefinition(
            data_type=DataType.FWD,
            supported_file_formats=[FileFormat.CSV, FileFormat.XLSX],
            canonical_fields=[
                CanonicalFieldDefinition(
                    key="test_id",
                    label="Test ID",
                    description="Unique falling weight deflectometer test identifier.",
                    required=True,
                    category=CanonicalFieldCategory.IDENTIFIER,
                    example_source_headers=["test_id", "drop_id"],
                ),
                CanonicalFieldDefinition(
                    key="station",
                    label="Station",
                    description="Station or chainage where the FWD drop was taken.",
                    required=True,
                    category=CanonicalFieldCategory.LOCATION,
                    example_source_headers=["station", "sta"],
                ),
                CanonicalFieldDefinition(
                    key="drop_load_lb",
                    label="Drop Load (lb)",
                    description="Applied FWD drop load in pounds.",
                    required=True,
                    category=CanonicalFieldCategory.MEASUREMENT,
                    example_source_headers=["drop_load_lb", "load_lb"],
                ),
                CanonicalFieldDefinition(
                    key="d0_mils",
                    label="D0 (mils)",
                    description="Center deflection measurement for the FWD drop.",
                    required=True,
                    category=CanonicalFieldCategory.MEASUREMENT,
                    example_source_headers=["d0_mils", "sensor_0_mils"],
                ),
                CanonicalFieldDefinition(
                    key="surface_temp_f",
                    label="Surface Temperature (F)",
                    description="Surface temperature recorded during FWD testing.",
                    category=CanonicalFieldCategory.CONTEXT,
                    example_source_headers=["surface_temp_f", "temp_f"],
                ),
            ],
        ),
        DataType.DCP: MappingDefinition(
            data_type=DataType.DCP,
            supported_file_formats=[FileFormat.CSV, FileFormat.XLSX],
            canonical_fields=[
                CanonicalFieldDefinition(
                    key="test_point_id",
                    label="Test Point ID",
                    description="Unique identifier for each DCP test point.",
                    required=True,
                    category=CanonicalFieldCategory.IDENTIFIER,
                    example_source_headers=["test_point_id", "point_id"],
                ),
                CanonicalFieldDefinition(
                    key="station",
                    label="Station",
                    description="Station or chainage where the DCP test occurred.",
                    required=True,
                    category=CanonicalFieldCategory.LOCATION,
                    example_source_headers=["station", "sta"],
                ),
                CanonicalFieldDefinition(
                    key="blow_count",
                    label="Blow Count",
                    description="Number of blows applied for the DCP reading.",
                    required=True,
                    category=CanonicalFieldCategory.MEASUREMENT,
                    example_source_headers=["blow_count", "blows"],
                ),
                CanonicalFieldDefinition(
                    key="depth_mm",
                    label="Depth (mm)",
                    description="Penetration depth in millimeters at the recorded blow count.",
                    required=True,
                    category=CanonicalFieldCategory.MEASUREMENT,
                    example_source_headers=["depth_mm", "penetration_mm"],
                ),
                CanonicalFieldDefinition(
                    key="layer_note",
                    label="Layer Note",
                    description="Optional field note about a layer break or material change.",
                    category=CanonicalFieldCategory.CONTEXT,
                    example_source_headers=["layer_note", "material_note"],
                ),
            ],
        ),
    }


class MappingDefinitionService:
    """Expose stable canonical RoadViz field definitions for mapping workflows."""

    def __init__(self) -> None:
        self._definitions = _build_definitions()
        self._gpr_import_service = GprImportService()

    def get_definition(self, data_type: DataType) -> MappingDefinition:
        definition = self._definitions[data_type]
        return definition.model_copy(deep=True)

    def get_definition_for_upload(self, upload: Upload) -> MappingDefinition:
        if upload.data_type == DataType.GPR:
            return self._gpr_import_service.build_mapping_definition(upload)
        return self.get_definition(upload.data_type)
