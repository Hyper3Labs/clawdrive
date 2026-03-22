import chalk from "chalk";
import type { Command } from "commander";
import { gc, rebuildTaxonomy } from "@clawdrive/core";
import { setupContext } from "../helpers.js";
import { formatJson } from "../formatters/json.js";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function registerGcCommand(program: Command) {
  program
    .command("gc")
    .description("Garbage collect deleted files and optimize storage")
    .option("--rebuild-taxonomy", "Also rebuild the taxonomy tree")
    .action(async (cmdOpts, cmd) => {
      const globalOpts = cmd.parent!.opts();
      const ctx = await setupContext(globalOpts);

      try {
        const result = await gc({ wsPath: ctx.wsPath });

        if (cmdOpts.rebuildTaxonomy) {
          if (!globalOpts.json) {
            console.log("Rebuilding taxonomy...");
          }
          await rebuildTaxonomy({ wsPath: ctx.wsPath });
        }

        if (globalOpts.json) {
          console.log(formatJson({
            ...result,
            taxonomyRebuilt: !!cmdOpts.rebuildTaxonomy,
          }));
        } else {
          if (result.deletedRows === 0) {
            console.log(chalk.dim("Nothing to clean up."));
          } else {
            console.log(`Removed ${result.deletedRows} row(s), freed ${formatBytes(result.freedBytes)}`);
          }
          if (cmdOpts.rebuildTaxonomy) {
            console.log(chalk.green("Taxonomy rebuilt."));
          }
        }
      } catch (err: any) {
        console.error(`Error during gc: ${err.message}`);
        process.exit(1);
      }
    });
}
