# NASA Demo Dataset

This folder now tracks the lightweight metadata for the NASA demo bundle: the manifest in `sources.json` and the six theme notes used to enrich text search.

The heavyweight NASA media is no longer committed to the repo. When you run `cdrive serve --demo nasa`, the CLI downloads the curated assets into the gitignored cache at `context/demo-datasets/nasa` and seeds a dedicated `nasa-demo` workspace by default.

## Demo bundle

- Images: 36
- Videos: 5
- Audio files: 5
- PDFs: 6
- Theme notes: 6
- Total demo assets: 58
- Tracked metadata files in this folder: 8
- Download size: 248.2 MB

## Why this shape

The full NASA Image and Video Library is not a single packaged dataset. NASA describes it as a searchable public library with more than 140,000 images, videos, and audio files across the agency.

For the demo, CDRIVE uses a curated subset rather than mirroring the full library. The goal is a first-run dataset that is large enough to make multimodal search, taxonomy browsing, and embedding-space exploration feel substantial, while still staying practical for an on-demand setup step.

## Themes

- Apollo 11: Moon mission imagery and launch-era media anchored on Apollo 11.
- Artemis: Current lunar program media centered on Orion, SLS, and Artemis II.
- James Webb: James Webb telescope hardware, optics, and mission visuals.
- Hubble: Hubble telescope imagery and observatory-related visuals.
- Mars: Mars rover imagery and Mars exploration documents.
- Earth: Earth observation imagery from orbit and human-spaceflight operations in low Earth orbit.

## Sources

- NASA library scale statement: https://www.nasa.gov/news-release/nasa-unveils-new-searchable-video-audio-and-imagery-library-for-the-public/
- NASA media usage guidelines: https://www.nasa.gov/nasa-brand-center/images-and-media/
- File-level provenance and exact download URLs are in `sources.json`.

