# UI Map

## Goal

Build a single-screen 3D file cloud that feels instantly shareable in a demo video. The map should prove, in a few seconds, that ClawDrive is a native multimodal memory system, not a file list with embeddings bolted on.

## Core Idea

- Use the Gemini Embedding 2 vectors already stored in LanceDB as the source of truth.
- Run UMAP on top of those vectors to compute stable 3D coordinates.
- Render the result as a spatial cloud inspired by repo_posts, but adapted for ClawDrive.
- Keep real file previews inside the cloud so the scene reads well in screenshots, short clips, and live demos.

## What Makes The Demo Viral

- The whole dataset is visible at once.
- Multimodality is obvious: PDFs, images, audio, video, and text live in the same space.
- Search becomes cinematic: type a concept, then fly into the relevant cluster.
- The cloud shows real previews, not abstract dots only, so people understand the value immediately.

## Product Shape

The 3D map is the hero surface for the agent view.

- Far zoom: a dense luminous cloud of files.
- Mid zoom: highlighted labels and modality markers appear.
- Near zoom: anchored previews appear on the nodes themselves.
- Selection: a restrained details card appears, but the cloud remains the focus.

The map should feel clean and composed, not like a hacker HUD. Default state should be mostly cloud, minimal chrome, one small search/status rail, and a calm camera drift until the user interacts.

## Preview-In-Cloud Behavior

Previews should be part of the 3D scene, similar to repo_posts.

- Image: thumbnail crop.
- PDF: first-page thumbnail.
- Video: poster frame.
- Audio: waveform or album-style cover tile.
- Text/code: compact text card with a strong typographic snippet.

Each node should have three visual states:

1. Point at distance.
2. Glyph or label at medium range.
3. Preview sprite or card at close range.

That keeps the map readable at scale while still delivering the payoff when the camera gets close.

## Visual Direction

Do not copy repo_posts' orange-purple cyberpunk look. For ClawDrive, the visual language should feel more like a deep-space archive: precise, cinematic, credible.

### Palette

- Background: `#061018`
- Panel: `#0E1A24`
- Border/Grid: `#1F3647`
- Text: `#E6F0F7`
- Primary Accent: `#6EE7FF`
- Secondary Accent: `#7BD389`
- Warm Highlight: `#FFB84D`

### Modality Colors

- PDF: `#8AB4FF`
- Image: `#7BD389`
- Video: `#C792EA`
- Audio: `#F6C177`
- Text/Code: `#9AD1FF`

Typography should be modern and calm. Use a sharp sans for interface chrome and reserve monospace for technical metadata only.

## Interaction Model

- Orbit, pan, zoom by default.
- Hover: subtle glow plus lightweight in-scene label.
- Click: lock selection, show preview and actions.
- Semantic search: compute nearest neighbors, then fly the camera to the weighted centroid.
- Optional density toggle: control how many preview sprites are visible.

The key demo move is: search for a concept like "Mars audio briefing" and watch mixed media converge into a visible spatial neighborhood.

## Architecture

### Data Source

- LanceDB stores the canonical Gemini Embedding 2 vectors and file metadata.
- The map reads from LanceDB-derived projection artifacts, not from raw files directly.

### Projection Pipeline

1. Read active embeddings from LanceDB.
2. Run UMAP to reduce high-dimensional vectors to 3D.
3. Persist a projection cache with:
   - `file_id`
   - `x`, `y`, `z`
   - `content_type`
   - `label`
   - `preview_url`
   - `updated_at`
   - `projection_version`
4. Recompute when file count changes materially, projection settings change, or the embedding model changes.

### Preview Pipeline

- Generate lightweight preview assets during ingestion or lazily on first view.
- Keep preview generation separate from the projection cache.
- Previews should be optimized for sprite rendering, not full document viewing.

### API Surface

- `GET /api/projections` returns coordinates plus render metadata.
- `POST /api/projections/recompute` rebuilds the cached UMAP layout.
- `GET /api/files/:id/preview` returns the preview asset used in the cloud.

### Frontend Rendering

- Three.js or React Three Fiber for the scene.
- Three render layers:
  - point layer for all files
  - preview sprite layer for nearby files
  - HUD layer for search, status, and selection
- Use batched sprites or a texture atlas for previews so the map stays smooth with hundreds or low thousands of visible files.

## Design Constraints

- The cloud is the product, not decoration.
- Keep side panels small and secondary.
- Optimize for demo legibility before power-user controls.
- The first impression should be visual clarity, not settings density.

## Reference

This direction is informed by the repo_posts 3D map interaction model, but adapted for ClawDrive's multimodal file system and demo goals.