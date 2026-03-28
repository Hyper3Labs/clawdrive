import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { countWords, getFileInfo, resolveFileInfo, update } from "@clawdrive/core";
import { formatJson } from "../formatters/json.js";
import { withoutVector } from "../formatters/strip-vector.js";
import { getGlobalOptions, setupWorkspaceContext } from "../helpers.js";

function buildCaptionPayload(info: { id: string; caption: string | null }) {
  return {
    id: info.id,
    caption: info.caption,
    wordCount: countWords(info.caption),
  };
}

export function registerCaptionCommand(program: Command) {
  program
    .command("caption <file>")
    .description("Show or update the caption for an image file")
    .option("--set <text>", "Set the caption text")
    .option("--set-file <path>", "Load caption text from a file")
    .option("--clear", "Clear the caption")
    .action(async (file: string, cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupWorkspaceContext(globalOpts);
      const editModeCount = [cmdOpts.set !== undefined, cmdOpts.setFile !== undefined, cmdOpts.clear === true]
        .filter(Boolean).length;

      if (editModeCount > 1) {
        console.error("Use exactly one of --set, --set-file, or --clear.");
        process.exitCode = 1;
        return;
      }

      try {
        const existing = await resolveFileInfo(file, { wsPath: ctx.wsPath, includeCaption: true });
        if (!existing) {
          console.error(`File not found: ${file}`);
          process.exitCode = 1;
          return;
        }

        if (!existing.content_type.startsWith("image/")) {
          console.error(`Caption command only applies to image files, got ${existing.content_type}`);
          process.exitCode = 1;
          return;
        }

        if (editModeCount > 0) {
          const caption = cmdOpts.clear
            ? null
            : cmdOpts.setFile
              ? await readFile(cmdOpts.setFile, "utf-8")
              : cmdOpts.set;

          await update(existing.id, { caption }, { wsPath: ctx.wsPath });

          const updated = await getFileInfo(existing.id, { wsPath: ctx.wsPath, includeCaption: true });
          if (!updated) {
            console.error(`File disappeared after update: ${file}`);
            process.exitCode = 1;
            return;
          }

          if (globalOpts.json) {
            console.log(formatJson({
              file: withoutVector(updated),
              caption: buildCaptionPayload(updated),
            }));
            return;
          }

          if (cmdOpts.clear) {
            console.log(`Cleared caption for ${updated.display_name ?? updated.original_name}`);
            return;
          }

          const payload = buildCaptionPayload(updated);
          console.log(`Updated caption for ${updated.display_name ?? updated.original_name} (${payload.wordCount} words)`);
          process.stdout.write(`${payload.caption}\n`);
          return;
        }

        const payload = buildCaptionPayload(existing);
        if (globalOpts.json) {
          console.log(formatJson(payload));
          return;
        }

        if (!payload.caption) {
          console.error(`No caption set for ${existing.display_name ?? existing.original_name}`);
          process.exitCode = 1;
          return;
        }

        process.stdout.write(`${payload.caption}\n`);
      } catch (err) {
        console.error(`Caption command error: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });
}