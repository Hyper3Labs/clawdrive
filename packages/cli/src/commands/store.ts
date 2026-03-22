import type { Command } from "commander";
import { store } from "@clawdrive/core";
import { setupContext } from "../helpers.js";
import { formatJson } from "../formatters/json.js";
import { formatStoreResult } from "../formatters/human.js";

export function registerStoreCommand(program: Command) {
  program
    .command("store <files...>")
    .description("Embed and store files")
    .option("--tags <tags>", "Comma-separated tags", (val: string) => val.split(","))
    .option("--desc <description>", "File description")
    .option("--fail-on-dup", "Exit with code 5 on duplicate")
    .action(async (files: string[], cmdOpts, cmd) => {
      const globalOpts = cmd.parent!.opts();
      const ctx = await setupContext(globalOpts);

      const results = [];
      for (const file of files) {
        try {
          const result = await store({
            sourcePath: file,
            tags: cmdOpts.tags,
            description: cmdOpts.desc,
          }, { wsPath: ctx.wsPath, embedder: ctx.embedder });
          results.push(result);

          if (!globalOpts.json) {
            console.log(formatStoreResult(result));
          }

          if (cmdOpts.failOnDup && result.status === "duplicate") {
            if (globalOpts.json) console.log(formatJson(result));
            process.exit(5);
          }
        } catch (err: any) {
          console.error(`Error storing ${file}: ${err.message}`);
          process.exit(1);
        }
      }

      if (globalOpts.json) {
        console.log(formatJson(results.length === 1 ? results[0] : results));
      }
    });
}
