# NASA Sample Dataset

This folder tracks the generic import manifest for the NASA demo bundle.

The heavyweight NASA media is no longer committed to the repo. When you run `cdrive serve --demo nasa`, the CLI downloads the referenced assets into the gitignored cache at `context/demo-datasets/nasa` and seeds a dedicated `nasa-demo` workspace by default.

## Bundle counts

- Images: 36
- Videos: 5
- Audio files: 5
- PDFs: 6
- Total demo assets: 52
- Download size: 248.2 MB

## Metadata scope

- `sources.json` only carries generic import fields needed to fetch the demo files: `fileName`, `bytes`, and `sourceUrl`.
- The manifest does not include generated notes, theme labels, query text, NASA IDs, descriptions, or tags.
- Product and share surfaces should treat the demo as ordinary files plus optional source URLs, not as hand-authored annotations.

## Sources

- NASA library scale statement: https://www.nasa.gov/news-release/nasa-unveils-new-searchable-video-audio-and-imagery-library-for-the-public/
- NASA media usage guidelines: https://www.nasa.gov/nasa-brand-center/images-and-media/

