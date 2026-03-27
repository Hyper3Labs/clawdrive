# ClawDrive

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Google Drive for AI agents.** Store any file -- PDFs, images, video, audio, text -- and search by meaning across modalities.

ClawDrive is an agent-native local file storage system with multimodal semantic search. Agents (and humans) can add files, organize them into shareable pots, and find anything with natural-language or cross-modal queries. A built-in 3D visualization renders your entire file cloud in the browser so you can explore clusters, fly into search results, and see real file previews in context.

## Quick Start

```bash
# Install globally
npm install -g clawdrive

# Set your Gemini API key
export GEMINI_API_KEY="your-key-here"

# Launch the web UI with a curated NASA demo (~248 MB on first run)
clawdrive serve --demo nasa
```

Or run directly with npx:

```bash
npx clawdrive serve --demo nasa
```

## Core Workflow

```bash
# Create a pot (a named, shareable collection)
clawdrive pot create acme-dd

# Add files, folders, or URLs
clawdrive add --pot acme-dd ./contracts ./docs https://docs.google.com/...

# Search by meaning
clawdrive search "the nda we sent acme" --pot acme-dd

# Cross-modal search: find documents related to a photo
clawdrive search --image ./photo.jpg

# Share with another agent or person
clawdrive share pot acme-dd --to claude-code --role read --expires 24h

# Start the API server and 3D web UI
clawdrive serve
```

Both `clawdrive` and `cdrive` work as the CLI binary name.

## Requirements

- **Node.js 18+**
- **ffmpeg** -- required for video and audio processing
- **Gemini API key** -- used for multimodal embeddings ([get one here](https://aistudio.google.com/apikey))

## Architecture

Monorepo with four packages:

| Package | Role |
|---|---|
| **@clawdrive/core** | Storage, embedding, search, taxonomy, pots, shares |
| **@clawdrive/server** | Express REST API |
| **@clawdrive/web** | Vite + React 3D frontend |
| **clawdrive** | CLI entry point |

LanceDB for vector storage. Gemini Embedding for multimodal embeddings.

## CLI Reference

See [CLI.md](CLI.md) for the full command reference.

## License

[MIT](LICENSE)
