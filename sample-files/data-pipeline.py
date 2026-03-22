"""Data ingestion pipeline for ClawDrive."""

import asyncio
import logging
from pathlib import Path
from typing import AsyncIterator

logger = logging.getLogger(__name__)


async def discover_files(root: Path, extensions: set[str] | None = None) -> AsyncIterator[Path]:
    """Walk directory tree and yield matching files."""
    for item in root.rglob("*"):
        if item.is_file():
            if extensions is None or item.suffix.lower() in extensions:
                yield item


async def ingest_file(path: Path, embed_fn, store) -> str:
    """Process and store a single file.

    Returns the file ID.
    """
    content = path.read_bytes()
    mime = detect_mime(path)

    chunks = chunk_content(content, mime)
    embeddings = await embed_fn(chunks)

    file_id = store.put(
        name=path.name,
        content=content,
        mime_type=mime,
        chunks=chunks,
        embeddings=embeddings,
    )

    logger.info("Ingested %s as %s (%d chunks)", path.name, file_id, len(chunks))
    return file_id


async def run_pipeline(
    root: Path,
    embed_fn,
    store,
    concurrency: int = 4,
) -> list[str]:
    """Run the full ingestion pipeline."""
    semaphore = asyncio.Semaphore(concurrency)
    file_ids = []

    async def process(path: Path):
        async with semaphore:
            fid = await ingest_file(path, embed_fn, store)
            file_ids.append(fid)

    tasks = []
    async for path in discover_files(root):
        tasks.append(asyncio.create_task(process(path)))

    await asyncio.gather(*tasks)
    logger.info("Pipeline complete: %d files ingested", len(file_ids))
    return file_ids


def detect_mime(path: Path) -> str:
    mime_map = {
        ".pdf": "application/pdf",
        ".md": "text/markdown",
        ".txt": "text/plain",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".mp4": "video/mp4",
    }
    return mime_map.get(path.suffix.lower(), "application/octet-stream")


def chunk_content(content: bytes, mime: str) -> list[str]:
    if mime.startswith("text/"):
        text = content.decode("utf-8", errors="replace")
        return [text[i:i+1000] for i in range(0, len(text), 800)]
    return [f"[binary:{mime}]"]
