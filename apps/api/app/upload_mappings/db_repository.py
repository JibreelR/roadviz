from __future__ import annotations

from uuid import UUID

from psycopg.types.json import Jsonb

from app.db.connection import Database
from app.db.serialization import dump_upload_mapping_payload, load_upload_mapping_payload
from app.projects.schemas import utc_now
from app.upload_mappings.schemas import UploadMappingState, UploadMappingWrite
from app.uploads.schemas import DataType


class DatabaseUploadMappingRepository:
    """Persist upload-to-canonical mappings in PostgreSQL."""

    def __init__(self, database: Database) -> None:
        self._database = database

    def get(self, upload_id: UUID) -> UploadMappingState | None:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        upload_id,
                        project_id,
                        data_type,
                        assignments,
                        updated_at
                    FROM upload_mappings
                    WHERE upload_id = %s
                    """,
                    (upload_id,),
                )
                row = cursor.fetchone()

        if row is None:
            return None

        mapping_payload = load_upload_mapping_payload(row["assignments"])

        return UploadMappingState.model_validate(
            {
                **row,
                "assignments": [
                    assignment.model_dump(mode="json")
                    for assignment in mapping_payload["assignments"]
                ],
                "custom_fields": [
                    custom_field.model_dump(mode="json")
                    for custom_field in mapping_payload["custom_fields"]
                ],
                "is_saved": True,
            }
        )

    def upsert(
        self,
        upload_id: UUID,
        project_id: UUID,
        data_type: DataType,
        mapping_in: UploadMappingWrite,
    ) -> UploadMappingState:
        timestamp = utc_now()

        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO upload_mappings (
                        upload_id,
                        project_id,
                        data_type,
                        assignments,
                        updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (upload_id)
                    DO UPDATE SET
                        project_id = EXCLUDED.project_id,
                        data_type = EXCLUDED.data_type,
                        assignments = EXCLUDED.assignments,
                        updated_at = EXCLUDED.updated_at
                    """,
                    (
                        upload_id,
                        project_id,
                        data_type.value,
                        Jsonb(dump_upload_mapping_payload(mapping_in)),
                        timestamp,
                    ),
                )

        return UploadMappingState(
            upload_id=upload_id,
            project_id=project_id,
            data_type=data_type,
            assignments=[assignment.model_copy(deep=True) for assignment in mapping_in.assignments],
            custom_fields=[
                custom_field.model_copy(deep=True) for custom_field in mapping_in.custom_fields
            ],
            updated_at=timestamp,
            is_saved=True,
        )
