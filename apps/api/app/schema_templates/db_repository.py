from __future__ import annotations

from uuid import uuid4

from psycopg.types.json import Jsonb

from app.db.connection import Database
from app.db.serialization import load_field_mappings
from app.projects.schemas import utc_now
from app.schema_templates.schemas import SchemaTemplate, SchemaTemplateWrite
from app.uploads.schemas import DataType


class DatabaseSchemaTemplateRepository:
    """Persist schema templates in PostgreSQL and seed defaults separately."""

    def __init__(self, database: Database) -> None:
        self._database = database

    def create(self, template_in: SchemaTemplateWrite) -> SchemaTemplate:
        timestamp = utc_now()
        template = SchemaTemplate(
            id=uuid4(),
            created_at=timestamp,
            updated_at=timestamp,
            **template_in.model_dump(),
        )

        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO schema_templates (
                        id,
                        name,
                        data_type,
                        is_default,
                        field_mappings,
                        created_at,
                        updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        template.id,
                        template.name,
                        template.data_type.value,
                        template.is_default,
                        Jsonb(template.field_mappings),
                        template.created_at,
                        template.updated_at,
                    ),
                )

        return template

    def list(self, data_type: DataType | None = None) -> list[SchemaTemplate]:
        query = """
            SELECT
                id,
                name,
                data_type,
                is_default,
                field_mappings,
                created_at,
                updated_at
            FROM schema_templates
        """
        params: tuple[object, ...] = ()
        if data_type is not None:
            query += " WHERE data_type = %s"
            params = (data_type.value,)
        query += " ORDER BY data_type ASC, is_default DESC, LOWER(name) ASC"

        with self._database.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(query, params)
                rows = cursor.fetchall()

        return [
            SchemaTemplate.model_validate(
                {
                    **row,
                    "field_mappings": load_field_mappings(row["field_mappings"]),
                }
            )
            for row in rows
        ]
