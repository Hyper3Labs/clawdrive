"""UMAP dimensionality reduction for 3D visualization."""

import numpy as np


def reduce_embeddings(
    vectors: np.ndarray,
    n_components: int = 3,
    n_neighbors: int = 15,
    min_dist: float = 0.1,
) -> np.ndarray:
    """Reduce high-dimensional embeddings to 3D for visualization.

    Args:
        vectors: Array of shape (n_samples, n_dimensions)
        n_components: Target dimensions (3 for 3D viz)
        n_neighbors: UMAP neighborhood size
        min_dist: UMAP minimum distance parameter

    Returns:
        Array of shape (n_samples, 3) with normalized coordinates
    """
    try:
        import umap
    except ImportError:
        raise ImportError("Install umap-learn: pip install umap-learn")

    reducer = umap.UMAP(
        n_components=n_components,
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        metric="cosine",
        random_state=42,
    )

    reduced = reducer.fit_transform(vectors)

    # Normalize to [-1, 1] range for Three.js
    for i in range(n_components):
        col = reduced[:, i]
        col_min, col_max = col.min(), col.max()
        if col_max > col_min:
            reduced[:, i] = 2 * (col - col_min) / (col_max - col_min) - 1

    return reduced
