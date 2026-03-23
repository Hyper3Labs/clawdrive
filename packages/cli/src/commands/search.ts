import type { Command } from "commander";
import { search } from "@clawdrive/core";
import type { SearchInput } from "@clawdrive/core";
import { getGlobalOptions, setupContext } from "../helpers.js";
import { formatJson } from "../formatters/json.js";
import { formatSearchResults } from "../formatters/human.js";

export function registerSearchCommand(program: Command) {
  program
    .command("search <query>")
    .description("Search by meaning across the workspace or a single pot")
    .option("--image <path>", "Image file to use as query input")
    .option("--mode <mode>", "Search mode: vector, fts, or hybrid", "vector")
    .option("--pot <pot>", "Limit search to a pot")
    .option("--type <mime>", "Filter by MIME content type")
    .option("--tags <tags>", "Comma-separated tag filter", (val: string) => val.split(","))
    .option("--limit <n>", "Max results to return", (val: string) => parseInt(val, 10), 10)
    .option("--min-score <n>", "Minimum score threshold", (val: string) => parseFloat(val))
    .option("--after <date>", "Filter: created after date (ISO 8601)")
    .option("--before <date>", "Filter: created before date (ISO 8601)")
    .action(async (query: string, cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupContext(globalOpts);

      const input: SearchInput = {
        query,
        mode: cmdOpts.mode as SearchInput["mode"],
        pot: cmdOpts.pot,
        contentType: cmdOpts.type,
        tags: cmdOpts.tags,
        limit: cmdOpts.limit,
        minScore: cmdOpts.minScore,
      };

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
      } catch (err: any) {
        console.error(`Search error: ${err.message}`);
        process.exit(1);
      }
    });
}
