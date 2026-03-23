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
cdrive pot add acme-dd ./contracts/nda.pdf ./context https://docs.google.com/...
cdrive search "the nda we sent acme" --pot acme-dd
cdrive get <file-or-share-ref>
```

Both `cdrive` and `clawdrive` work as the CLI binary name.

## CLI

| Command          | Description                                       |
|------------------|---------------------------------------------------|
| `pot create`     | Create a pot (shared folder with smart retrieval)  |
| `pot add`        | Add files, folders, or URLs to a pot               |
| `search`         | Semantic search across workspace or a single pot   |
| `get`            | Resolve a file ref or share ref to content         |
| `share pot`      | Share a pot via link or to a specific principal     |
| `share inbox`    | Show pending share approvals                       |
| `share approve`  | Approve a pending share                            |
| `share revoke`   | Revoke a share                                     |
| `serve`          | Start API server + web UI                          |

`search` supports `--image <path>` for cross-modal queries (e.g. find documents related to a photo).

## NASA Demo

`cdrive serve --demo nasa` launches a curated multimodal demo.

- First run downloads ~248 MB of NASA media into `context/demo-datasets/nasa` (gitignored)
- Uses its own `nasa-demo` workspace so your normal workspace stays untouched
- Pass `--workspace <name>` to override
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
