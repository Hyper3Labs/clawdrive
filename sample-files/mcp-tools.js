/**
 * MCP tool definitions for ClawDrive agent integration.
 */

const tools = [
  {
    name: "clawdrive_search",
    description: "Search files in ClawDrive using semantic similarity",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language search query" },
        max_results: { type: "number", default: 10 },
        file_type: { type: "string", enum: ["pdf", "image", "audio", "video", "text", "code"] },
      },
      required: ["query"],
    },
  },
  {
    name: "clawdrive_upload",
    description: "Upload a file to ClawDrive",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Base64-encoded file content" },
        filename: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["content", "filename"],
    },
  },
  {
    name: "clawdrive_browse",
    description: "Browse files in ClawDrive taxonomy",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Category path like 'Research/NLP'" },
        sort_by: { type: "string", enum: ["recent", "name", "size", "type"] },
      },
    },
  },
];

async function handleToolCall(name, args) {
  switch (name) {
    case "clawdrive_search":
      return await performSearch(args.query, args.max_results, args.file_type);
    case "clawdrive_upload":
      return await uploadFile(args.content, args.filename, args.tags);
    case "clawdrive_browse":
      return await browseCategory(args.category, args.sort_by);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

module.exports = { tools, handleToolCall };
