import type { Command } from "commander";
import { requirePot } from "@clawdrive/core";
import { formatJson } from "../formatters/json.js";
import { getGlobalOptions, setupContext } from "../helpers.js";
import { importSources } from "../import-sources.js";
import { summarizeImportResults } from "../pot-import.js";

export function registerAddCommand(program: Command) {
  program
    .command("add <sources...>")
    .description("Add local files, folders, or links")
    .option("--pot <pot>", "Also attach imported files to a pot")
    .action(async (sources: string[], cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupContext(globalOpts);

      try {
        const potRecord = cmdOpts.pot
          ? await requirePot(cmdOpts.pot, { wsPath: ctx.wsPath })
          : null;
        const results = await importSources(
          sources,
          { wsPath: ctx.wsPath, embedder: ctx.embedder },
          potRecord?.slug,
        );
        const summary = summarizeImportResults(results);

        if (globalOpts.json) {
          console.log(formatJson({
            ...(potRecord ? { pot: potRecord.slug } : {}),
            total: results.length,
            ...summary,
            results,
          }));
        } else {
          if (potRecord) {
            console.log(`Pot ${potRecord.slug}: ${summary.stored} stored, ${summary.attached} attached, ${summary.existing} already present, ${summary.failed} failed`);
          } else {
            console.log(`${summary.stored} stored, ${summary.existing} already present, ${summary.failed} failed`);
          }

          for (const result of results) {
            if (result.status === "error") {
              console.log(`- ${result.status} ${result.source}: ${result.error}`);
            } else {
              console.log(`- ${result.status} ${result.source}`);
            }
          }
        }

        if (summary.failed > 0) {
          process.exitCode = 1;
        }
      } catch (err) {
        console.error(`Error adding files: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}