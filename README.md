# ClawDrive

Agent-native local file storage with multimodal semantic search. Store any file — PDFs, images, video, audio, text — and search by meaning across modalities.

## Requirements

- Node.js 18+
- `ffmpeg` for video and audio processing

## Quick Start

```bash
npm install && npm run build

# Set your Gemini API key
export GEMINI_API_KEY="your-key-here"

# Launch the curated NASA demo (downloads ~248 MB on first run)
cdrive serve --demo nasa

# Or work with your own files
cdrive pot create acme-dd
cdrive add --pot acme-dd ./contracts/nda.pdf ./context https://docs.google.com/...
cdrive search "the nda we sent acme" --pot acme-dd
cdrive get <file-or-share-ref>
```

Both `cdrive` and `clawdrive` work as the CLI binary name.

## CLI

| Command          | Description                                       |
|------------------|---------------------------------------------------|
| `add`            | Add files, folders, or URLs                        |
| `pot create`     | Create a pot (shared folder with smart retrieval)  |
| `pot add`        | Add files to a pot (compatibility alias)           |
| `search`         | Semantic search across all files or a single pot   |
| `get`            | Resolve a file name or share to content            |
| `share pot`      | Share a pot via link or to a specific principal     |
| `share inbox`    | Show pending share approvals                       |
| `share approve`  | Approve a pending share                            |
| `share revoke`   | Revoke a share                                     |
| `serve`          | Start API server + web UI                          |

`search` supports `--image <path>` for cross-modal queries (e.g. find documents related to a photo).

## NASA Demo

`cdrive serve --demo nasa` launches a curated multimodal demo.

- First run downloads ~248 MB of NASA media into `context/demo-datasets/nasa` (gitignored)
- Uses an isolated demo dataset so your normal files stay untouched
- The manifest and theme notes live in `sample-files/`

## Architecture

Monorepo with four packages:

| Package | Role |
|-|-|
| **@clawdrive/core** | Storage, embedding, search, taxonomy, pots, shares |
| **@clawdrive/server** | Express REST API |
| **@clawdrive/web** | Vite + React frontend |
| **clawdrive** | CLI |

LanceDB for vector storage. Gemini Embedding for multimodal embeddings.

## Future Roadmap

- Share index portability: when sender and receiver use compatible CLI embedding settings, transfer chunk and file embeddings with shared pots to avoid re-embedding on download, with local fallback when incompatible.
- Full agent-authored taxonomy: keep the current clustering-based hierarchy as the bootstrap, make clustering quality and stability reliable, then add an agent todo/review loop that can refine labels and propose or apply taxonomy moves safely.
- Binary file handling: split raw blob storage from semantic indexing so arbitrary binaries can still be stored, named, shared, and tracked even when Gemini cannot embed them, with clear unsupported status plus a path to extractor/transcoder plugins for formats we can later make searchable.
