# ClawDrive

**Google Drive for AI agents.** Store any file — PDFs, images, video, audio, text — and search by meaning across modalities.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://github.com/hyper3labs/clawdrive/blob/main/LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/hyper3labs/clawdrive?style=flat-square&color=green)](https://github.com/hyper3labs/clawdrive/releases)

[Website](https://claw3drive.com) · [Live Demo](https://app.claw3drive.com/)

## Quick Start

```bash
npm install -g clawdrive

export GEMINI_API_KEY="your-key-here"

# Launch the web UI with a curated NASA demo
clawdrive serve --demo nasa
```

Or run directly without installing:

```bash
npx clawdrive serve --demo nasa
```

> Get a free Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

## Features

- **Multimodal semantic search** — query across text, images, video, and audio with natural language
- **Cross-modal retrieval** — find documents related to a photo, or videos matching a text description
- **Pots** — named, shareable file collections with fine-grained access control
- **3D file cloud** — interactive Three.js visualization with UMAP-projected embeddings
- **Agent-native sharing** — time-limited shares with read/write roles
- **REST API** — full programmatic access for integration with any tool or agent
- **CLI-first** — every feature accessible from the terminal, with `--json` output for scripting

## Usage

```bash
clawdrive pot create acme-dd
clawdrive add --pot acme-dd ./contracts ./docs
clawdrive search "the nda we sent acme" --pot acme-dd
clawdrive search --image ./photo.jpg
clawdrive share pot acme-dd --to claude-code --role read --expires 24h
clawdrive serve
```

Both `clawdrive` and `cdrive` work as the CLI command.

## Requirements

- **Node.js 18+**
- **ffmpeg** — for video and audio processing
- **Gemini API key** — for multimodal embeddings ([get one free](https://aistudio.google.com/apikey))

## Documentation

Full documentation, CLI reference, and architecture details at **[github.com/hyper3labs/clawdrive](https://github.com/hyper3labs/clawdrive)**.

## License

[MIT](https://github.com/hyper3labs/clawdrive/blob/main/LICENSE) — Copyright 2026 hyper3labs
