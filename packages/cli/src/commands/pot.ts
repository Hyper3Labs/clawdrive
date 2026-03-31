import type { Command } from "commander";
import { createPot, requirePot, listPots, listPotFiles } from "@clawdrive/core";
import { formatJson } from "../formatters/json.js";
import { formatPotList } from "../formatters/human.js";
import { getGlobalOptions, setupContext, setupWorkspaceContext } from "../helpers.js";
import { importSources } from "../import-sources.js";
import { summarizeImportResults } from "../pot-import.js";

export function registerPotCommand(program: Command) {
  const pot = program
    .command("pot")
    .description("Create pots and add files, folders, or links to them");

  pot
    .command("create <name>")
    .description("Create a shared pot")
    .option("--desc <description>", "Pot description")
    .action(async (name: string, cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupWorkspaceContext(globalOpts);

      try {
        const created = await createPot(
          {
            name,
            description: cmdOpts.desc,
          },
          { wsPath: ctx.wsPath },
        );

        if (globalOpts.json) {
          console.log(formatJson(created));
        } else {
          console.log(`Created pot ${created.slug}`);
        }
      } catch (err) {
        console.error(`Error creating pot: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  pot
    .command("list")
    .alias("ls")
    .description("List all pots")
    .action(async (_cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupWorkspaceContext(globalOpts);

      try {
        const pots = await listPots({ wsPath: ctx.wsPath });
        const potsWithCounts = [];
        for (const p of pots) {
          const files = await listPotFiles(p.slug, { wsPath: ctx.wsPath });
          potsWithCounts.push({ ...p, fileCount: files.length });
        }

        if (globalOpts.json) {
          console.log(formatJson(potsWithCounts));
        } else {
          console.log(formatPotList(potsWithCounts));
        }
      } catch (err) {
        console.error(`Error listing pots: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  pot
    .command("add <pot> <sources...>")
    .description("Add local files, folders, or links to a pot (alias for cdrive add --pot)")
    .action(async (potRef: string, sources: string[], _cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupContext(globalOpts);

      try {
        const potRecord = await requirePot(potRef, { wsPath: ctx.wsPath });
        const results = await importSources(
          sources,
          { wsPath: ctx.wsPath, embedder: ctx.embedder },
          potRecord.slug,
        );
        const summary = summarizeImportResults(results);

        if (globalOpts.json) {
          console.log(formatJson({
            pot: potRecord.slug,
            total: results.length,
            ...summary,
            results,
          }));
        } else {
          console.log(`Pot ${potRecord.slug}: ${summary.stored} stored, ${summary.attached} attached, ${summary.existing} already present, ${summary.failed} failed`);
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
        console.error(`Error adding to pot: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}