# System Architecture

```
+------------------+     +------------------+     +------------------+
|   Web Frontend   |     |   CLI Client     |     |   MCP Server     |
|   (React/Vite)   |     |   (Commander)    |     |   (Agent Tools)  |
+--------+---------+     +--------+---------+     +--------+---------+
         |                         |                        |
         +------------+------------+------------------------+
                      |
              +-------v--------+
              |   Core Engine  |
              |  (TypeScript)  |
              +-------+--------+
                      |
         +------------+------------+
         |            |            |
   +-----v----+ +----v-----+ +---v------+
   | Chunker  | | Embedder | | Storage  |
   | Pipeline | | (Gemini) | | (SQLite) |
   +----------+ +----------+ +----------+
```

## Data Flow
1. File ingested via any client (web, CLI, MCP)
2. Chunker detects type and splits into segments
3. Embedder generates multimodal vectors
4. Storage indexes vectors + metadata in SQLite
5. Search queries embed and find nearest neighbors
