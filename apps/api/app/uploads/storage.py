from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile


@dataclass(frozen=True)
class StoredUploadFile:
    storage_path: str
    size_bytes: int


class LocalUploadStorage:
    """Persist uploaded source files to local disk for parsing and later persistence work."""

    def __init__(self, base_dir: Path) -> None:
        self._base_dir = base_dir
        self._base_dir.mkdir(parents=True, exist_ok=True)

    async def save(self, upload_file: UploadFile, filename: str) -> StoredUploadFile:
        suffix = Path(filename).suffix.lower()
        target_path = self._base_dir / f"{uuid4()}{suffix}"
        size_bytes = 0

        with target_path.open("wb") as handle:
            while True:
                chunk = await upload_file.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
                size_bytes += len(chunk)

        await upload_file.seek(0)

        return StoredUploadFile(
            storage_path=str(target_path.resolve()),
            size_bytes=size_bytes,
        )
