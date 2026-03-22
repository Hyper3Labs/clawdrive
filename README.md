# ClawDrive

Smart file storage with semantic search for AI agents. Store any file, automatically extract content and embeddings, then search by meaning.

## Requirements

- Node.js 18+
- `ffmpeg` required for video and audio file processing

## Quick Start

```bash
# Install
npm install

# Build
npm run build

# Set your Gemini API key
export GEMINI_API_KEY="your-key-here"

# Store a file
clawdrive store document.pdf --tags report,quarterly

# Search by meaning
clawdrive search "revenue growth trends"

# Read file content
clawdrive read <file-id>
```

## CLI Commands

| Command    | Description                                      |
|------------|--------------------------------------------------|
| `store`    | Embed and store files with optional tags          |
| `search`   | Semantic or full-text search across stored files |
| `read`     | Read stored file content by ID                   |
| `info`     | Show metadata for a stored file                  |
| `rm`       | Soft-delete a stored file                        |
| `update`   | Update file metadata (tags, description)         |
| `export`   | Copy a stored file to a destination path         |
| `open`     | Open a stored file with the system default app   |
| `ls`       | List stored files with optional filters          |
| `tree`     | Show taxonomy hierarchy                          |
| `import`   | Recursively ingest files from a directory        |
| `config`   | Manage ClawDrive configuration                   |
| `doctor`   | Run health checks on the workspace               |
| `gc`       | Garbage collect deleted files and optimize storage |
| `usage`    | Show API usage statistics                        |

## Architecture

ClawDrive is a monorepo with two packages:

- **@clawdrive/core** -- Library: workspace management, storage, embedding, chunking, search, taxonomy
- **clawdrive** -- CLI: 15 commands wrapping the core library

Uses LanceDB for vector storage and Google Gemini for embeddings.
