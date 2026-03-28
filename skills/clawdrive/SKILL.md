---
name: clawdrive
description: "ClawDrive — agent-native local file platform with multimodal semantic search. Use for adding files, searching, sharing pots, inspecting/downloading shares, transcription (see transcription.md), and tunnels (see tunnels.md)."
metadata: {"openclaw": {"requires": {"env": ["GEMINI_API_KEY"], "anyBins": ["ffmpeg", "ffprobe"]}, "primaryEnv": "GEMINI_API_KEY", "homepage": "https://github.com/Hyper3Labs/clawdrive", "install": [{"kind": "node", "package": "clawdrive", "bins": ["clawdrive"], "label": "Install ClawDrive (npm)"}, {"kind": "brew", "formula": "ffmpeg", "bins": ["ffmpeg"], "label": "Install ffmpeg (brew)"}]}}
---

# ClawDrive

Agent-native local file storage with multimodal semantic search, shareable collections (pots), and a 3D browser UI.

## Install

```bash
npm install -g clawdrive
```

Or run without installing: `npx clawdrive <command>`.

**Skill install:**
```bash
clawdrive install-skill                      # auto-detects your agent (Claude/Codex/Copilot)
clawdrive install-skill --agent claude       # explicit agent target
clawdrive install-skill --project            # install into current project instead of global
npx skills add Hyper3Labs/clawdrive          # alternative: via skills.sh
```

## Prerequisites

| Dependency | Install |
|---|---|
| Node.js 18+ | `brew install node` |
| ffmpeg | `brew install ffmpeg` |
| Gemini API key | Free at https://aistudio.google.com/apikey |

```bash
export GEMINI_API_KEY="your-key-here"
```

## Quick Start

```bash
clawdrive serve --demo nasa          # web UI + API on :7432 (downloads ~248 MB first run)
clawdrive serve                      # start with your own workspace
```

## Core Commands

```bash
clawdrive add ./docs ./photos        # add files or directories
clawdrive add https://example.com    # add a URL
clawdrive add --pot my-project .     # add into a pot

clawdrive search "quarterly revenue" # text search
clawdrive search --image photo.jpg   # cross-modal: find docs related to a photo
clawdrive search --file clip.mp4     # search by any media type

clawdrive pot create research        # create a pot
clawdrive pot add research ./papers  # add files to an existing pot

clawdrive get "README.md"            # read a file by canonical name
clawdrive todo                       # list files missing summaries
clawdrive tldr "report.pdf" --set "Q3 financials summary"
clawdrive caption "photo.jpg" --set "Astronaut beside a rover on Mars"
clawdrive digest "report.pdf"        # show/set longer markdown digest
clawdrive rename "old.txt" --set "better-name.txt"
```

All commands accept `--json` for machine-readable output.

## Sharing

### Creating Shares

```bash
clawdrive share pot my-project --to claude-code --role read --expires 24h
clawdrive share pot my-project --link --role read   # create public link (pending approval)
clawdrive share inbox                               # list pending approvals
clawdrive share approve <share-id>                  # approve and get token
```

### Receiving a Share URL

When given a ClawDrive public share URL (`/s/<token>` or `/s/<token>/manifest.json`), follow this workflow.

**Input normalization** — these are all equivalent:

- `https://host/s/<token>`
- `https://host/s/<token>/`
- `https://host/s/<token>/manifest.json`

Do not pass item content URLs (`/items/<id>/content`) to `share info|ls|download`. Those are for direct HTTP download only.

**Default behavior:** If the user only pastes a share URL without saying what to do, inspect first — do not silently import everything.

#### Inspect a share

```bash
clawdrive share info <share-url>             # metadata + TL;DRs
clawdrive share ls <share-url>               # shorter file listing
clawdrive --json share info <share-url>      # machine-readable
```

#### Import the full share

```bash
clawdrive share download <share-url>
clawdrive share download <share-url> --pot local-copy
```

- If `--pot` is omitted, the CLI uses the source pot name from the manifest
- Files may report as `stored`, `attached`, or `already present`
- `attached` means content already existed locally and was added to the target pot
- Per-item failures are reported; treat as partial success, not full success

#### Import selected items

```bash
clawdrive share ls <share-url>
clawdrive share download <share-url> --item <share-item-id>
clawdrive share download <share-url> --item <id-1> --item <id-2> --pot selected-files
```

#### Fetch without ClawDrive

Use this when the CLI is not installed and should not be, or only raw bytes are needed.

```bash
curl -fsSL <share-url>/manifest.json                          # load manifest
curl -fLo output.bin <share-url>/items/<share-item-id>/content # download a file
file output.bin && ls -lh output.bin                           # verify
```

This downloads raw files only — no dedupe, no embedding.

#### Agent decision logic for share URLs

1. User only gives a share URL → inspect first (`share info`)
2. User asks what is in the share → `share info` or `share ls`
3. User asks to receive/import → `share download`
4. User asks for a specific file → inspect first, find the item ID, then `share download --item <id>`
5. User says not to install ClawDrive → use direct HTTP fetches

#### Completion checks

For CLI import: command exits 0, summary counts match expectations, zero failed items (or failures explicitly noted).

For raw HTTP: response is 200, file written locally, `file <path>` confirms the expected content type.

### Exposing Publicly via Tunnel

→ See [tunnels.md](tunnels.md) for ranked tunnel options (Tailscale, Cloudflare, ngrok, etc.).

## Transcribing Audio & Video

ClawDrive embeds audio/video multimodally but does **not** extract text transcripts by default.

→ See [transcription.md](transcription.md) for transcription tool rankings and agent auto-detection strategy.

## Captioning Images

ClawDrive does not generate image captions by default. To add a human- or agent-authored caption to an image record, use:

```bash
clawdrive todo --kind caption
clawdrive caption photo.jpg --set "Astronaut beside a rover on Mars"
```

If you want the caption text to exist as a standalone retrievable document, also add a sidecar `.txt` or `.md` file.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/files/store` | Upload and embed a file |
| `GET` | `/api/files` | List files |
| `GET` | `/api/search?q=...` | Semantic search |
| `POST` | `/api/pots` | Create a pot |
| `GET` | `/api/pots/:pot/files` | List files in a pot |
| `POST` | `/api/shares/pot/:pot` | Create a share |
| `GET` | `/api/projections` | UMAP 3D projections |

## Supported File Types

**Documents:** PDF · **Images:** PNG, JPG, GIF, WEBP, SVG · **Video:** MP4, MOV, WEBM · **Audio:** MP3, WAV, OGG, M4A · **Text:** MD, TXT, JSON, YAML, HTML, CSS, XML · **Code:** TS, JS, PY, RS, GO

## Development

```bash
git clone https://github.com/Hyper3Labs/clawdrive.git && cd clawdrive
npm install
npm run dev          # turbo watch: tsc + Vite on :5173
# in another terminal:
node packages/cli/dist/bin/clawdrive.js serve --port 7432
```

Vite proxies `/api` → `localhost:7432`.
