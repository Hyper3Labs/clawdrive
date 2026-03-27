import type { Command } from "commander";
import { getFileInfo, resolveFileInfo, update } from "@clawdrive/core";
import { formatJson } from "../formatters/json.js";
import { withoutVector } from "../formatters/strip-vector.js";
import { getGlobalOptions, setupWorkspaceContext } from "../helpers.js";

export function registerRenameCommand(program: Command) {
  program
    .command("rename <file>")
    .description("Show or update the canonical name for a stored file")
    .option("--set <name>", "Set the canonical file name")
    .option("--clear", "Clear the canonical override and fall back to the source name")
    .action(async (file: string, cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupWorkspaceContext(globalOpts);

      if (cmdOpts.set && cmdOpts.clear) {
        console.error("Use either --set or --clear, not both.");
        process.exit(1);
      }

      try {
        const existing = await resolveFileInfo(file, { wsPath: ctx.wsPath, includeDigest: true });
        if (!existing) {
          console.error(`File not found: ${file}`);
          process.exit(1);
        }

        if (cmdOpts.set || cmdOpts.clear) {
          await update(
            existing.id,
            { displayName: cmdOpts.clear ? null : cmdOpts.set },
            { wsPath: ctx.wsPath },
          );

          const updated = await getFileInfo(existing.id, { wsPath: ctx.wsPath, includeDigest: true });
          if (!updated) {
            console.error(`File disappeared after update: ${file}`);
            process.exit(1);
          }

          if (globalOpts.json) {
            console.log(formatJson({
              file: withoutVector(updated),
              displayName: updated.display_name,
              originalName: updated.original_name,
            }));
            return;
          }

          if (cmdOpts.clear) {
            console.log(`Canonical name is now ${updated.display_name ?? updated.original_name}`);
            return;
          }

          console.log(`Renamed ${existing.display_name ?? existing.original_name} to ${updated.display_name ?? updated.original_name}`);
          return;
        }

        // Show current canonical name
        if (globalOpts.json) {
          console.log(formatJson({
            id: existing.id,
            displayName: existing.display_name,
            originalName: existing.original_name,
          }));
          return;
        }

        if (existing.display_name) {
          console.log(`${existing.display_name} (original: ${existing.original_name})`);
        } else {
          console.log(`${existing.original_name} (using source name)`);
        }
      } catch (err) {
        console.error(`Rename error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
