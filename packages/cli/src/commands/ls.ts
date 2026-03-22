import chalk from "chalk";
import type { Command } from "commander";
import { listFiles } from "@clawdrive/core";
import { setupContext } from "../helpers.js";
import { formatJson } from "../formatters/json.js";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function registerLsCommand(program: Command) {
  program
    .command("ls [path]")
    .description("List stored files")
    .option("--limit <n>", "Max files to list", (val: string) => parseInt(val, 10), 50)
    .action(async (path: string | undefined, cmdOpts, cmd) => {
      const globalOpts = cmd.parent!.opts();
      const ctx = await setupContext(globalOpts);

      try {
        const result = await listFiles(
          { limit: cmdOpts.limit, taxonomyPath: path ? path.split("/") : undefined },
          { wsPath: ctx.wsPath },
        );

        if (globalOpts.json) {
          console.log(formatJson(result));
          return;
        }

        if (result.items.length === 0) {
          console.log(chalk.dim("No files found."));
          return;
        }

        // Table header
        const header = [
          "Name".padEnd(30),
          "Type".padEnd(20),
          "Size".padEnd(10),
          "Date".padEnd(12),
          "ID",
        ].join("  ");
        console.log(chalk.bold(header));
        console.log("-".repeat(header.length));

        for (const item of result.items) {
          const name = item.original_name.length > 28
            ? item.original_name.slice(0, 27) + "…"
            : item.original_name;
          const row = [
            name.padEnd(30),
            item.content_type.padEnd(20),
            formatBytes(item.file_size).padEnd(10),
            formatDate(item.created_at).padEnd(12),
            chalk.dim(item.id.slice(0, 12)),
          ].join("  ");
          console.log(row);
        }

        if (result.nextCursor) {
          console.log(chalk.dim(`\n… more files available`));
        }
      } catch (err: any) {
        console.error(`Error listing files: ${err.message}`);
        process.exit(1);
      }
    });
}
