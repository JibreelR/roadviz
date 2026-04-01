from __future__ import annotations

from app.mapping_definitions.schemas import (
    CanonicalFieldCategory,
    CanonicalFieldDefinition,
    MappingDefinition,
)
from app.uploads.schemas import DataType, FileFormat


def _build_definitions() -> dict[DataType, MappingDefinition]:
    return {
        DataType.GPR: MappingDefinition(
            data_type=DataType.GPR,
            supported_file_formats=[FileFormat.CSV, FileFormat.XLSX],
            canonical_fields=[
                CanonicalFieldDefinition(
                    key="segment_id",
                    label="Segment ID",
                    description="Unique roadway segment or run identifier for the GPR line.",
                    required=True,
                    category=CanonicalFieldCategory.IDENTIFIER,
                    example_source_headers=["segment_id", "segment", "run_id"],
                ),
                CanonicalFieldDefinition(
                    key="scan_distance_ft",
                    label="Scan Distance (ft)",
                    description="Distance along the survey run where the radar sample was collected.",
                    required=True,
                    category=CanonicalFieldCategory.LOCATION,
                    example_source_headers=["distance_ft", "offset_ft", "scan_distance_ft"],
                ),
                CanonicalFieldDefinition(
                    key="dielectric",
                    label="Dielectric",
                    description="Calculated dielectric value used for later layer interpretation.",
                    required=True,
                    category=CanonicalFieldCategory.MEASUREMENT,
                    example_source_headers=["dielectric", "epsilon_r"],
                ),
                CanonicalFieldDefinition(
                    key="surface_temp_f",
                    label="Surface Temperature (F)",
                    description="Surface temperature captured during the GPR collection pass.",
                    category=CanonicalFieldCategory.CONTEXT,
                    example_source_headers=["surface_temp_f", "surface_temperature_f"],
                ),
                CanonicalFieldDefinition(
                    key="lane",
                    label="Lane",
                    description="Lane or wheelpath descriptor for the measurement line.",
                    category=CanonicalFieldCategory.CONTEXT,
                    example_source_headers=["lane", "travel_lane"],
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

    def get_definition(self, data_type: DataType) -> MappingDefinition:
        definition = self._definitions[data_type]
        return definition.model_copy(deep=True)
