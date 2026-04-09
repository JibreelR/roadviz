from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row


class Database:
    """Open short-lived psycopg connections for MVP repository operations."""

    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    @contextmanager
    def connection(self) -> Iterator[psycopg.Connection]:
        connection = psycopg.connect(self._dsn, row_factory=dict_row)
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

