"""Embedding client for ClawDrive."""

import asyncio
from dataclasses import dataclass

import httpx


@dataclass
class EmbeddingResult:
    vector: list[float]
    model: str
    dimensions: int
    token_count: int


class EmbeddingClient:
    """Client for generating multimodal embeddings."""

    def __init__(self, api_key: str, model: str = "gemini-embedding-2"):
        self.api_key = api_key
        self.model = model
        self._client = httpx.AsyncClient(timeout=30.0)

    async def embed_text(self, text: str) -> EmbeddingResult:
        """Generate embedding for text content."""
        response = await self._client.post(
            f"https://api.example.com/v1/embeddings",
            json={"input": text, "model": self.model},
            headers={"Authorization": f"Bearer {self.api_key}"},
        )
        data = response.json()
        return EmbeddingResult(
            vector=data["embedding"],
            model=self.model,
            dimensions=len(data["embedding"]),
            token_count=data["usage"]["total_tokens"],
        )

    async def embed_batch(self, texts: list[str]) -> list[EmbeddingResult]:
        """Generate embeddings for multiple texts concurrently."""
        tasks = [self.embed_text(t) for t in texts]
        return await asyncio.gather(*tasks)

    async def close(self):
        await self._client.aclose()
