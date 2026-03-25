import type { Command } from "commander";
import {
  TLDR_RECOMMENDED_MAX_WORDS,
  TLDR_RECOMMENDED_MIN_WORDS,
  countWords,
  getFileInfo,
  update,
} from "@clawdrive/core";
import { formatJson } from "../formatters/json.js";
import { getGlobalOptions, setupWorkspaceContext } from "../helpers.js";

function withoutVector<T extends { vector?: unknown }>(record: T): Omit<T, "vector"> {
  const { vector: _vector, ...rest } = record;
  return rest;
}

function buildTldrPayload(info: { id: string; tldr?: string | null; abstract?: string | null; description: string | null }) {
  const tldr = info.tldr ?? info.abstract ?? info.description ?? null;
  const wordCount = countWords(tldr);

  return {
    id: info.id,
    tldr,
    wordCount,
    recommendedWordRange: {
      min: TLDR_RECOMMENDED_MIN_WORDS,
      max: TLDR_RECOMMENDED_MAX_WORDS,
    },
    withinRecommendedRange:
      tldr == null
        ? false
        : wordCount >= TLDR_RECOMMENDED_MIN_WORDS && wordCount <= TLDR_RECOMMENDED_MAX_WORDS,
  };
}

export function registerTldrCommand(program: Command) {
  program
    .command("tldr <ref>")
    .alias("abstract")
    .description("Show or update the short TL;DR for a stored file")
    .option("--set <text>", "Set the TL;DR text")
    .option("--clear", "Clear the TL;DR")
    .action(async (ref: string, cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupWorkspaceContext(globalOpts);

      if (cmdOpts.set && cmdOpts.clear) {
        console.error("Use either --set or --clear, not both.");
        process.exit(1);
      }

      try {
        const existing = await getFileInfo(ref, { wsPath: ctx.wsPath });
        if (!existing) {
          console.error(`File not found: ${ref}`);
          process.exit(1);
        }

        if (cmdOpts.set || cmdOpts.clear) {
          await update(
            existing.id,
            { tldr: cmdOpts.clear ? null : cmdOpts.set },
            { wsPath: ctx.wsPath },
          );

          const updated = await getFileInfo(existing.id, { wsPath: ctx.wsPath });
          if (!updated) {
            console.error(`File not found after update: ${existing.id}`);
            process.exit(1);
          }

          if (globalOpts.json) {
            console.log(formatJson({
              file: withoutVector(updated),
              tldr: buildTldrPayload(updated),
            }));
            return;
          }

          if (cmdOpts.clear) {
            console.log(`Cleared TL;DR for ${updated.original_name} (${updated.id})`);
            return;
          }

          const payload = buildTldrPayload(updated);
          console.log(`Updated TL;DR for ${updated.original_name} (${payload.wordCount} words)`);
          process.stdout.write(`${payload.tldr}\n`);
          return;
        }

        const payload = buildTldrPayload(existing);
        if (globalOpts.json) {
          console.log(formatJson(payload));
          return;
        }

        if (!payload.tldr) {
          console.error(`No TL;DR set for ${existing.original_name} (${existing.id})`);
          process.exit(1);
        }

        process.stdout.write(`${payload.tldr}\n`);
      } catch (err) {
        console.error(`TL;DR command error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}