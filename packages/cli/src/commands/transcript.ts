import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { countWords, getFileInfo, resolveFileInfo, update } from "@clawdrive/core";
import { formatJson } from "../formatters/json.js";
import { withoutVector } from "../formatters/strip-vector.js";
import { getGlobalOptions, setupWorkspaceContext } from "../helpers.js";

function buildTranscriptPayload(info: { id: string; transcript: string | null }) {
  return {
    id: info.id,
    transcript: info.transcript,
    wordCount: countWords(info.transcript),
  };
}

export function registerTranscriptCommand(program: Command) {
  program
    .command("transcript <file>")
    .description("Show or update the transcript for an audio or video file")
    .option("--set <text>", "Set the transcript text")
    .option("--set-file <path>", "Load transcript text from a file")
    .option("--clear", "Clear the transcript")
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
        const existing = await resolveFileInfo(file, { wsPath: ctx.wsPath, includeTranscript: true });
        if (!existing) {
          console.error(`File not found: ${file}`);
          process.exitCode = 1;
          return;
        }

        if (!existing.content_type.startsWith("audio/") && !existing.content_type.startsWith("video/")) {
          console.error(`Transcript command only applies to audio/video files, got ${existing.content_type}`);
          process.exitCode = 1;
          return;
        }

        if (editModeCount > 0) {
          const transcript = cmdOpts.clear
            ? null
            : cmdOpts.setFile
              ? await readFile(cmdOpts.setFile, "utf-8")
              : cmdOpts.set;

          await update(existing.id, { transcript }, { wsPath: ctx.wsPath });

          const updated = await getFileInfo(existing.id, { wsPath: ctx.wsPath, includeTranscript: true });
          if (!updated) {
            console.error(`File disappeared after update: ${file}`);
            process.exitCode = 1;
            return;
          }

          if (globalOpts.json) {
            console.log(formatJson({
              file: withoutVector(updated),
              transcript: buildTranscriptPayload(updated),
            }));
            return;
          }

          if (cmdOpts.clear) {
            console.log(`Cleared transcript for ${updated.display_name ?? updated.original_name}`);
            return;
          }

          const payload = buildTranscriptPayload(updated);
          console.log(`Updated transcript for ${updated.display_name ?? updated.original_name} (${payload.wordCount} words)`);
          process.stdout.write(`${payload.transcript}\n`);
          return;
        }

        const payload = buildTranscriptPayload(existing);
        if (globalOpts.json) {
          console.log(formatJson(payload));
          return;
        }

        if (!payload.transcript) {
          console.error(`No transcript set for ${existing.display_name ?? existing.original_name}`);
          process.exitCode = 1;
          return;
        }

        process.stdout.write(`${payload.transcript}\n`);
      } catch (err) {
        console.error(`Transcript command error: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });
}