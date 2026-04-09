from __future__ import annotations

from uuid import UUID, uuid4

from psycopg.types.json import Jsonb

from app.db.connection import Database
from app.db.serialization import load_gpr_import_config
from app.projects.schemas import utc_now
from app.uploads.schemas import Upload, UploadWrite


class DatabaseUploadRepository:
    """Persist upload metadata and storage paths in PostgreSQL."""

    def __init__(self, database: Database) -> None:
        self._database = database

    def create(self, upload_in: UploadWrite, storage_path: str) -> Upload:
        upload = Upload(
            id=uuid4(),
            uploaded_at=utc_now(),
            **upload_in.model_dump(),
        )

        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO uploads (
                        id,
                        project_id,
                        filename,
                        data_type,
                        file_format,
                        status,
                        notes,
                        uploaded_at,
                        storage_path
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        upload.id,
                        upload.project_id,
                        upload.filename,
                        upload.data_type.value,
                        upload.file_format.value,
                        upload.status.value,
                        upload.notes,
                        upload.uploaded_at,
                        storage_path,
                    ),
                )
                if upload.gpr_import_config is not None:
                    cursor.execute(
                        """
                        INSERT INTO gpr_upload_configs (
                            upload_id,
                            file_identifier,
                            channel_count,
                            channel_labels,
                            interface_count,
                            interface_labels
                        )
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (
                            upload.id,
                            upload.gpr_import_config.file_identifier,
                            upload.gpr_import_config.channel_count,
                            Jsonb(upload.gpr_import_config.model_dump(mode="json")["channel_labels"]),
                            upload.gpr_import_config.interface_count,
                            Jsonb(
                                upload.gpr_import_config.model_dump(mode="json")[
                                    "interface_labels"
                                ]
                            ),
                        ),
                    )

        return upload

    def list_by_project(self, project_id: UUID) -> list[Upload]:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        uploads.id,
                        uploads.project_id,
                        uploads.filename,
                        uploads.data_type,
                        uploads.file_format,
                        uploads.status,
                        uploads.notes,
                        uploads.uploaded_at,
                        gpr_upload_configs.file_identifier,
                        gpr_upload_configs.channel_count,
                        gpr_upload_configs.channel_labels,
                        gpr_upload_configs.interface_count,
                        gpr_upload_configs.interface_labels
                    FROM uploads
                    LEFT JOIN gpr_upload_configs
                        ON gpr_upload_configs.upload_id = uploads.id
                    WHERE uploads.project_id = %s
                    ORDER BY uploads.uploaded_at DESC
                    """,
                    (project_id,),
                )
                rows = cursor.fetchall()

        return [self._build_upload(row) for row in rows]

    def get(self, upload_id: UUID) -> Upload | None:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        uploads.id,
                        uploads.project_id,
                        uploads.filename,
                        uploads.data_type,
                        uploads.file_format,
                        uploads.status,
                        uploads.notes,
                        uploads.uploaded_at,
                        gpr_upload_configs.file_identifier,
                        gpr_upload_configs.channel_count,
                        gpr_upload_configs.channel_labels,
                        gpr_upload_configs.interface_count,
                        gpr_upload_configs.interface_labels
                    FROM uploads
                    LEFT JOIN gpr_upload_configs
                        ON gpr_upload_configs.upload_id = uploads.id
                    WHERE uploads.id = %s
                    """,
                    (upload_id,),
                )
                row = cursor.fetchone()

        if row is None:
            return None
        return self._build_upload(row)

    def get_storage_path(self, upload_id: UUID) -> str | None:
        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT storage_path FROM uploads WHERE id = %s",
                    (upload_id,),
                )
                row = cursor.fetchone()

        if row is None:
            return None
        return row["storage_path"]

    def _build_upload(self, row: dict) -> Upload:
        gpr_import_config = None
        if row["file_identifier"] is not None:
            gpr_import_config = load_gpr_import_config(
                {
                    "file_identifier": row["file_identifier"],
                    "channel_count": row["channel_count"],
                    "channel_labels": row["channel_labels"],
                    "interface_count": row["interface_count"],
                    "interface_labels": row["interface_labels"],
                }
            )

        return Upload.model_validate(
            {
                "id": row["id"],
                "project_id": row["project_id"],
                "filename": row["filename"],
                "data_type": row["data_type"],
                "file_format": row["file_format"],
                "status": row["status"],
                "notes": row["notes"],
                "uploaded_at": row["uploaded_at"],
                "gpr_import_config": gpr_import_config.model_dump(mode="json")
                if gpr_import_config is not None
                else None,
            }
        )
