import type { Command } from "commander";
import { search } from "@clawdrive/core";
import type { SearchInput } from "@clawdrive/core";
import { getGlobalOptions, setupContext } from "../helpers.js";
import { formatJson } from "../formatters/json.js";
import { formatSearchResults } from "../formatters/human.js";

export function registerSearchCommand(program: Command) {
  program
    .command("search [query]")
    .description("Search by meaning across all files or a single pot")
    .option("--file <path>", "Image, PDF, audio, or video file to use as query input")
    .option("--image <path>", "Image file to use as query input")
    .option("--pot <pot>", "Limit search to a pot")
    .option("--type <mime>", "Filter by MIME content type")
    .option("--tags <tags>", "Comma-separated tag filter", (val: string) => val.split(","))
    .option("--limit <n>", "Max results to return", (val: string) => parseInt(val, 10), 10)
    .option("--min-score <n>", "Minimum score threshold", (val: string) => parseFloat(val))
    .option("--after <date>", "Filter: created after date (ISO 8601)")
    .option("--before <date>", "Filter: created before date (ISO 8601)")
    .action(async (query: string | undefined, cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupContext(globalOpts);

      const input: SearchInput = {
        query,
        pot: cmdOpts.pot,
        contentType: cmdOpts.type,
        tags: cmdOpts.tags,
        limit: cmdOpts.limit,
        minScore: cmdOpts.minScore,
      };

      if (cmdOpts.file) {
        input.queryFile = cmdOpts.file;
      }
      if (cmdOpts.image) {
        input.queryImage = cmdOpts.image;
      }
      if (cmdOpts.after) {
        input.after = new Date(cmdOpts.after);
      }
      if (cmdOpts.before) {
        input.before = new Date(cmdOpts.before);
      }

      try {
        const results = await search(input, { wsPath: ctx.wsPath, embedder: ctx.embedder });

        if (globalOpts.json) {
          console.log(formatJson(results));
        } else {
          console.log(formatSearchResults(results));
        }
      } catch (err) {
        const msg = (err as Error).message ?? "";
        const isAuthError =
          msg.includes("API key expired") ||
          msg.includes("API key not valid") ||
          msg.includes("API_KEY_INVALID");
        const isRateLimit = msg.includes("429");

        if (globalOpts.json) {
          const code = isAuthError ? "INVALID_API_KEY" : isRateLimit ? "RATE_LIMIT" : "SEARCH_ERROR";
          const error = isAuthError
            ? "Gemini API key is invalid or expired."
            : isRateLimit
              ? "Gemini API rate limit exceeded."
              : msg;
          console.error(JSON.stringify({ error, code }));
        } else if (isAuthError) {
          console.error("Error: Gemini API key is invalid or expired.");
          console.error("Get a free key at https://aistudio.google.com/apikey");
          console.error('Set it with: export GEMINI_API_KEY="your-key"');
        } else if (isRateLimit) {
          console.error("Error: Gemini API rate limit exceeded. Wait a moment and retry.");
        } else {
          console.error(`Search error: ${msg}`);
        }
        process.exit(1);
      }
    });
}
