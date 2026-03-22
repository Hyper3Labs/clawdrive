# API Design Notes

## REST Endpoints

### Files
- `POST /api/files` — Upload and ingest a file
- `GET /api/files/:id` — Retrieve file metadata
- `GET /api/files/:id/content` — Download file content
- `DELETE /api/files/:id` — Remove a file

### Search
- `POST /api/search` — Semantic search across all files
- `GET /api/search/similar/:id` — Find files similar to a given file

### Taxonomy
- `GET /api/taxonomy` — Get the full category tree
- `PUT /api/taxonomy/:nodeId` — Update category assignment

## Authentication
Using bearer tokens with JWT. Agents authenticate via API keys.
