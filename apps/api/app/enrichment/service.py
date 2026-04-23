from __future__ import annotations

from uuid import UUID, uuid4

from app.enrichment.repository import EnrichmentRepository
from app.enrichment.schemas import (
    EnrichedResultSet,
    EnrichedUploadRow,
    EnrichmentRequest,
    EnrichmentRunSummary,
    GprMovingAveragePoint,
    GprMovingAverageRequest,
    GprMovingAverageResultSet,
    LinearReferenceMethod,
    ProjectStationMilepostTieRow,
    ProjectStationMilepostTieTable,
    ProjectStationMilepostTieTableWrite,
    UploadDistanceStationTieRow,
    UploadDistanceStationTieTable,
    UploadDistanceStationTieTableWrite,
)
from app.normalization.repository import NormalizedUploadRepository
from app.normalization.schemas import GprNormalizedRow, NormalizedUploadRow
from app.projects.schemas import utc_now
from app.uploads.schemas import DataType, Upload


class EnrichmentError(Exception):
    """Raised when normalized rows cannot be enriched or analyzed."""


class LinearReferencingEnrichmentService:
    """Apply manual linear-reference ties and produce first-pass GPR outputs."""

    def __init__(
        self,
        normalized_repository: NormalizedUploadRepository,
        enrichment_repository: EnrichmentRepository,
    ) -> None:
        self._normalized_repository = normalized_repository
        self._enrichment_repository = enrichment_repository

    def save_project_station_milepost_tie_table(
        self,
        project_id: UUID,
        tie_table_in: ProjectStationMilepostTieTableWrite,
    ) -> ProjectStationMilepostTieTable:
        rows = [
            ProjectStationMilepostTieRow(
                station=row.station,
                station_value=parse_station_value(row.station),
                milepost=row.milepost,
            )
            for row in tie_table_in.rows
        ]
        rows = sorted(rows, key=lambda row: row.station_value)
        station_values = [row.station_value for row in rows]
        if len(set(station_values)) != len(station_values):
            raise EnrichmentError("Project station tie values must be unique.")

        tie_table = ProjectStationMilepostTieTable(
            project_id=project_id,
            updated_at=utc_now(),
            rows=rows,
        )
        return self._enrichment_repository.save_project_station_milepost_tie_table(
            tie_table
        )

    def save_upload_distance_station_tie_table(
        self,
        upload: Upload,
        tie_table_in: UploadDistanceStationTieTableWrite,
    ) -> UploadDistanceStationTieTable:
        rows = [
            UploadDistanceStationTieRow(
                distance=row.distance,
                station=row.station,
                station_value=parse_station_value(row.station),
            )
            for row in tie_table_in.rows
        ]
        rows = sorted(rows, key=lambda row: row.distance)
        distances = [row.distance for row in rows]
        if len(set(distances)) != len(distances):
            raise EnrichmentError("Tie distances must be unique.")

        tie_table = UploadDistanceStationTieTable(
            upload_id=upload.id,
            project_id=upload.project_id,
            updated_at=utc_now(),
            rows=rows,
        )
        return self._enrichment_repository.save_upload_distance_station_tie_table(
            tie_table
        )

    def apply_ties(
        self,
        upload: Upload,
        request: EnrichmentRequest,
    ) -> EnrichmentRunSummary:
        upload_tie_table = (
            self._enrichment_repository.get_upload_distance_station_tie_table(upload.id)
        )
        if upload_tie_table is None:
            raise EnrichmentError(
                "Save upload distance/station ties before applying enrichment."
            )
        if len(upload_tie_table.rows) < 2:
            raise EnrichmentError(
                "At least two upload distance/station tie rows are required."
            )

        project_tie_table = (
            self._enrichment_repository.get_project_station_milepost_tie_table(
                upload.project_id
            )
        )
        if project_tie_table is None:
            raise EnrichmentError(
                "Save project station/MP ties before applying enrichment."
            )
        if len(project_tie_table.rows) < 2:
            raise EnrichmentError(
                "At least two project station/MP tie rows are required."
            )

        normalized_rows = self._get_all_normalized_rows(upload.id)
        enriched_rows: list[EnrichedUploadRow] = []

        for row in normalized_rows:
            distance = _extract_distance(row)
            if distance is None:
                continue
            station_value, station_method = interpolate_distance_to_station(
                distance,
                upload_tie_table.rows,
            )
            milepost, milepost_method = interpolate_station_to_milepost(
                station_value,
                project_tie_table.rows,
            )
            enriched_rows.append(
                EnrichedUploadRow(
                    upload_id=upload.id,
                    source_row_index=row.row_index,
                    data_type=row.data_type,
                    normalized_row=row,
                    distance=distance,
                    derived_station=format_station(station_value),
                    derived_station_value=station_value,
                    derived_milepost=milepost,
                    linear_reference_method=combine_linear_reference_methods(
                        station_method,
                        milepost_method,
                    ),
                )
            )

        result = EnrichedResultSet(
            upload_id=upload.id,
            data_type=upload.data_type,
            enriched_at=utc_now(),
            normalized_row_count=len(normalized_rows),
            enriched_row_count=len(enriched_rows),
            skipped_row_count=len(normalized_rows) - len(enriched_rows),
            preview_rows=enriched_rows[: request.preview_row_count],
            rows=enriched_rows,
        )
        saved_result = self._enrichment_repository.save_enriched_result(result)
        return EnrichmentRunSummary(
            upload_id=saved_result.upload_id,
            data_type=saved_result.data_type,
            enriched_at=saved_result.enriched_at,
            normalized_row_count=saved_result.normalized_row_count,
            enriched_row_count=saved_result.enriched_row_count,
            skipped_row_count=saved_result.skipped_row_count,
            preview_rows=saved_result.preview_rows,
        )

    def get_enriched_result(
        self,
        upload_id: UUID,
        *,
        limit: int = 0,
        offset: int = 0,
    ) -> EnrichedResultSet | None:
        return self._enrichment_repository.get_enriched_result(
            upload_id,
            limit=limit,
            offset=offset,
        )

    def create_gpr_moving_average(
        self,
        upload: Upload,
        request: GprMovingAverageRequest,
    ) -> GprMovingAverageResultSet:
        if upload.data_type != DataType.GPR:
            raise EnrichmentError("GPR moving-average analysis is only available for GPR uploads.")

        enriched_rows = self._get_all_enriched_rows(upload.id)
        interface_number = _parse_interface_number(request.field_key)
        candidates = [
            _build_gpr_analysis_candidate(row, interface_number)
            for row in enriched_rows
            if row.normalized_row.data_type == DataType.GPR
        ]
        candidates = [candidate for candidate in candidates if candidate is not None]
        if request.channel_number is not None:
            candidates = [
                candidate
                for candidate in candidates
                if candidate.channel_number == request.channel_number
            ]
        if not candidates:
            raise EnrichmentError(
                "No enriched GPR rows with numeric values were found for that field and channel."
            )

        field_label = candidates[0].field_label
        points: list[GprMovingAveragePoint] = []
        half_window = request.window_distance / 2
        by_channel: dict[int, list[_GprAnalysisCandidate]] = {}
        for candidate in candidates:
            by_channel.setdefault(candidate.channel_number, []).append(candidate)

        for channel_candidates in by_channel.values():
            ordered = sorted(channel_candidates, key=lambda candidate: candidate.distance)
            for candidate in ordered:
                window_values = [
                    other.raw_value
                    for other in ordered
                    if abs(other.distance - candidate.distance) <= half_window
                ]
                if not window_values:
                    continue
                points.append(
                    GprMovingAveragePoint(
                        source_row_index=candidate.source_row_index,
                        distance=candidate.distance,
                        scan=candidate.scan,
                        channel_number=candidate.channel_number,
                        channel_label=candidate.channel_label,
                        station=candidate.station,
                        station_value=candidate.station_value,
                        milepost=candidate.milepost,
                        raw_value=candidate.raw_value,
                        moving_average=sum(window_values) / len(window_values),
                    )
                )

        points = sorted(points, key=lambda point: (point.channel_number, point.distance))
        result = GprMovingAverageResultSet(
            id=uuid4(),
            upload_id=upload.id,
            created_at=utc_now(),
            field_key=request.field_key,
            interface_number=interface_number,
            field_label=field_label,
            window_distance=request.window_distance,
            channel_number=request.channel_number,
            source_enriched_row_count=len(enriched_rows),
            point_count=len(points),
            preview_points=points[: request.preview_point_count],
            points=points,
        )
        return self._enrichment_repository.save_moving_average_result(result)

    def get_moving_average_result(
        self,
        upload_id: UUID,
        result_id: UUID,
        *,
        limit: int = 0,
        offset: int = 0,
    ) -> GprMovingAverageResultSet | None:
        return self._enrichment_repository.get_moving_average_result(
            upload_id,
            result_id,
            limit=limit,
            offset=offset,
        )

    def _get_all_normalized_rows(self, upload_id: UUID) -> list[NormalizedUploadRow]:
        summary = self._normalized_repository.get(upload_id)
        if summary is None:
            raise EnrichmentError("Normalized results not found. Run normalization first.")
        if summary.normalized_row_count == 0:
            return []
        result = self._normalized_repository.get(
            upload_id,
            limit=summary.normalized_row_count,
            offset=0,
        )
        return result.rows if result is not None else []

    def _get_all_enriched_rows(self, upload_id: UUID) -> list[EnrichedUploadRow]:
        summary = self._enrichment_repository.get_enriched_result(upload_id)
        if summary is None:
            raise EnrichmentError("Enriched results not found. Apply ties before analysis.")
        if summary.enriched_row_count == 0:
            return []
        result = self._enrichment_repository.get_enriched_result(
            upload_id,
            limit=summary.enriched_row_count,
            offset=0,
        )
        return result.rows if result is not None else []


def parse_station_value(station: str) -> float:
    normalized = station.strip().replace(" ", "")
    if "+" not in normalized:
        try:
            return float(normalized)
        except ValueError as exc:
            raise EnrichmentError(
                "Station must be numeric or use civil station format such as 123+45.67."
            ) from exc

    station_part, offset_part = normalized.split("+", 1)
    try:
        station_number = int(station_part)
        offset = float(offset_part)
    except ValueError as exc:
        raise EnrichmentError(
            "Station must be numeric or use civil station format such as 123+45.67."
        ) from exc

    sign = -1 if station_number < 0 else 1
    return station_number * 100 + sign * offset


def format_station(station_value: float) -> str:
    sign = "-" if station_value < 0 else ""
    absolute = abs(station_value)
    station_number = int(absolute // 100)
    offset = absolute - station_number * 100
    return f"{sign}{station_number}+{offset:05.2f}"


def interpolate_distance_to_station(
    distance: float,
    rows: list[UploadDistanceStationTieRow],
) -> tuple[float, LinearReferenceMethod]:
    for row in rows:
        if abs(row.distance - distance) <= 1e-9:
            return row.station_value, "exact"

    left, right, method = _find_bracketing_rows(
        distance,
        rows,
        lambda row: row.distance,
    )

    distance_span = right.distance - left.distance
    if distance_span == 0:
        raise EnrichmentError("Tie distances must be unique.")

    ratio = (distance - left.distance) / distance_span
    station_value = left.station_value + ratio * (
        right.station_value - left.station_value
    )
    return station_value, method


def interpolate_station_to_milepost(
    station_value: float,
    rows: list[ProjectStationMilepostTieRow],
) -> tuple[float, LinearReferenceMethod]:
    for row in rows:
        if abs(row.station_value - station_value) <= 1e-9:
            return row.milepost, "exact"

    left, right, method = _find_bracketing_rows(
        station_value,
        rows,
        lambda row: row.station_value,
    )

    station_span = right.station_value - left.station_value
    if station_span == 0:
        raise EnrichmentError("Project station tie values must be unique.")

    ratio = (station_value - left.station_value) / station_span
    milepost = left.milepost + ratio * (right.milepost - left.milepost)
    return milepost, method


def combine_linear_reference_methods(
    station_method: LinearReferenceMethod,
    milepost_method: LinearReferenceMethod,
) -> LinearReferenceMethod:
    if station_method == "extrapolated" or milepost_method == "extrapolated":
        return "extrapolated"
    if station_method == "interpolated" or milepost_method == "interpolated":
        return "interpolated"
    return "exact"


def _find_bracketing_rows[T](
    value: float,
    rows: list[T],
    get_value,
) -> tuple[T, T, LinearReferenceMethod]:
    method: LinearReferenceMethod = "interpolated"
    if value < get_value(rows[0]):
        return rows[0], rows[1], "extrapolated"
    if value > get_value(rows[-1]):
        return rows[-2], rows[-1], "extrapolated"

    left = rows[0]
    right = rows[-1]
    for index in range(len(rows) - 1):
        if get_value(rows[index]) <= value <= get_value(rows[index + 1]):
            left = rows[index]
            right = rows[index + 1]
            break

    return left, right, method


def interpolate_ties(
    distance: float,
    rows: list[UploadDistanceStationTieRow],
) -> tuple[float, LinearReferenceMethod]:
    return interpolate_distance_to_station(distance, rows)


def _extract_distance(row: NormalizedUploadRow) -> float | None:
    if row.data_type == DataType.GPR:
        return row.normalized_values.distance
    return None


def _parse_interface_number(field_key: str) -> int:
    try:
        return int(field_key.removeprefix("interface_depth_"))
    except ValueError as exc:
        raise EnrichmentError("Moving average field must be an interface depth field.") from exc


class _GprAnalysisCandidate:
    def __init__(
        self,
        *,
        source_row_index: int,
        distance: float,
        scan: float | None,
        channel_number: int,
        channel_label: str,
        station: str,
        station_value: float,
        milepost: float,
        raw_value: float,
        field_label: str,
    ) -> None:
        self.source_row_index = source_row_index
        self.distance = distance
        self.scan = scan
        self.channel_number = channel_number
        self.channel_label = channel_label
        self.station = station
        self.station_value = station_value
        self.milepost = milepost
        self.raw_value = raw_value
        self.field_label = field_label


def _build_gpr_analysis_candidate(
    row: EnrichedUploadRow,
    interface_number: int,
) -> _GprAnalysisCandidate | None:
    normalized_row = row.normalized_row
    if not isinstance(normalized_row, GprNormalizedRow):
        return None

    interface = next(
        (
            item
            for item in normalized_row.normalized_values.interface_depths
            if item.interface_number == interface_number
        ),
        None,
    )
    if interface is None or interface.depth is None:
        return None

    values = normalized_row.normalized_values
    return _GprAnalysisCandidate(
        source_row_index=row.source_row_index,
        distance=row.distance,
        scan=values.scan,
        channel_number=values.channel_number,
        channel_label=values.channel_label,
        station=row.derived_station,
        station_value=row.derived_station_value,
        milepost=row.derived_milepost,
        raw_value=interface.depth,
        field_label=interface.interface_label,
    )
