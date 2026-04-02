from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field, field_validator, model_validator


class GprSurveyLayout(StrEnum):
    SINGLE_CHANNEL = "single_channel"
    MULTI_CHANNEL_LONG = "multi_channel_long"


def _normalize_label_map(
    value: object,
    *,
    count: int | None,
    field_name: str,
) -> dict[int, str]:
    if value is None or value == "":
        return {}
    if not isinstance(value, dict):
        raise ValueError(f"{field_name} must be an object keyed by number.")

    normalized: dict[int, str] = {}
    for raw_key, raw_label in value.items():
        try:
            key = int(raw_key)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{field_name} keys must be numeric.") from exc

        label = str(raw_label).strip()
        if not label:
            continue
        if key < 1:
            raise ValueError(f"{field_name} keys must start at 1.")
        if count is not None and key > count:
            raise ValueError(
                f"{field_name} key {key} exceeds the configured count of {count}."
            )
        normalized[key] = label

    return dict(sorted(normalized.items()))


class GprImportConfig(BaseModel):
    file_identifier: str = Field(..., min_length=1, max_length=120)
    channel_count: int = Field(..., ge=1, le=64)
    channel_labels: dict[int, str] = Field(default_factory=dict)
    interface_count: int = Field(..., ge=1, le=24)
    interface_labels: dict[int, str] = Field(default_factory=dict)

    @field_validator("file_identifier")
    @classmethod
    def normalize_file_identifier(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("File identifier cannot be blank.")
        return normalized

    @field_validator("channel_labels", mode="before")
    @classmethod
    def normalize_channel_labels(cls, value: object, info) -> dict[int, str]:
        channel_count = info.data.get("channel_count")
        return _normalize_label_map(
            value,
            count=channel_count if isinstance(channel_count, int) else None,
            field_name="Channel labels",
        )

    @field_validator("interface_labels", mode="before")
    @classmethod
    def normalize_interface_labels(cls, value: object, info) -> dict[int, str]:
        interface_count = info.data.get("interface_count")
        return _normalize_label_map(
            value,
            count=interface_count if isinstance(interface_count, int) else None,
            field_name="Interface labels",
        )

    @model_validator(mode="after")
    def validate_label_ranges(self) -> "GprImportConfig":
        for key in self.channel_labels:
            if key > self.channel_count:
                raise ValueError(
                    f"Channel label {key} exceeds the configured channel count of {self.channel_count}."
                )
        for key in self.interface_labels:
            if key > self.interface_count:
                raise ValueError(
                    f"Interface label {key} exceeds the configured interface count of {self.interface_count}."
                )
        return self

    @property
    def layout(self) -> GprSurveyLayout:
        if self.channel_count == 1:
            return GprSurveyLayout.SINGLE_CHANNEL
        return GprSurveyLayout.MULTI_CHANNEL_LONG

    def default_channel_label(self, channel_number: int) -> str:
        return self.channel_labels.get(channel_number, f"Channel {channel_number}")

    def interface_label(self, interface_number: int) -> str:
        return self.interface_labels.get(interface_number, f"Interface {interface_number}")
