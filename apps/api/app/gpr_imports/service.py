from __future__ import annotations

from app.gpr_imports.schemas import GprImportConfig
from app.mapping_definitions.schemas import (
    CanonicalFieldCategory,
    CanonicalFieldDefinition,
    MappingDefinition,
)
from app.uploads.schemas import DataType, FileFormat, Upload


class GprImportConfigurationError(Exception):
    """Raised when a GPR upload is missing the configuration needed for import setup."""


def interface_depth_field_key(interface_number: int) -> str:
    return f"interface_depth_{interface_number}"


class GprImportService:
    """Build GPR-specific mapping contracts and label defaults from upload metadata."""

    def get_config(self, upload: Upload) -> GprImportConfig:
        if upload.data_type != DataType.GPR:
            raise GprImportConfigurationError("Only GPR uploads have GPR import configuration.")
        if upload.gpr_import_config is None:
            raise GprImportConfigurationError(
                "GPR upload metadata is required before mapping can continue."
            )
        return upload.gpr_import_config

    def build_mapping_definition(self, upload: Upload) -> MappingDefinition:
        config = self.get_config(upload)
        canonical_fields = [
            CanonicalFieldDefinition(
                key="scan",
                label="Scan",
                description="Optional scan index or trace number for the GPR row.",
                category=CanonicalFieldCategory.LOCATION,
                example_source_headers=[
                    "scan",
                    "scan_no",
                    "scan_number",
                    "trace",
                ],
            ),
            CanonicalFieldDefinition(
                key="distance",
                label="Distance",
                description="Optional distance value for the GPR row, such as feet along the run.",
                category=CanonicalFieldCategory.LOCATION,
                example_source_headers=[
                    "distance",
                    "distance_ft",
                    "offset_ft",
                    "chainage",
                ],
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
        ]

        if config.channel_count > 1:
            canonical_fields.append(
                CanonicalFieldDefinition(
                    key="channel_number",
                    label="Channel Number",
                    description="Channel number for multi-channel long-format GPR rows.",
                    required=True,
                    category=CanonicalFieldCategory.CONTEXT,
                    example_source_headers=[
                        "channel",
                        "channel_number",
                        "antenna",
                    ],
                )
            )

        canonical_fields.append(
            CanonicalFieldDefinition(
                key="channel_label",
                label="Channel Label",
                description="Optional channel label when the source file includes it explicitly.",
                category=CanonicalFieldCategory.CONTEXT,
                example_source_headers=["channel_label", "lane_label", "antenna_label"],
            )
        )

        for interface_number in range(1, config.interface_count + 1):
            interface_label = config.interface_label(interface_number)
            canonical_fields.append(
                CanonicalFieldDefinition(
                    key=interface_depth_field_key(interface_number),
                    label=f"{interface_label} Depth",
                    description=(
                        f"Absolute depth to interface {interface_number} "
                        f"('{interface_label}') for the GPR trace row."
                    ),
                    required=True,
                    category=CanonicalFieldCategory.MEASUREMENT,
                    example_source_headers=[
                        f"interface_{interface_number}",
                        f"depth_{interface_number}",
                        f"layer_{interface_number}",
                    ],
                )
            )

        return MappingDefinition(
            data_type=DataType.GPR,
            supported_file_formats=[FileFormat.CSV, FileFormat.XLSX],
            canonical_fields=canonical_fields,
        )
