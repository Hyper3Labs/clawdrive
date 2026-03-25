import type { Command } from "commander";
import { countWords, getFileInfo, update } from "@clawdrive/core";
import { formatJson } from "../formatters/json.js";
import { getGlobalOptions, setupWorkspaceContext } from "../helpers.js";

function withoutVector<T extends { vector?: unknown }>(record: T): Omit<T, "vector"> {
  const { vector: _vector, ...rest } = record;
  return rest;
}

function buildDigestPayload(info: { id: string; digest: string | null }) {
  return {
    id: info.id,
    digest: info.digest,
    wordCount: countWords(info.digest),
  };
}

export function registerDigestCommand(program: Command) {
  program
    .command("digest <ref>")
    .description("Show or update the structured digest for a stored file")
    .option("--set <text>", "Set the digest markdown")
    .option("--clear", "Clear the digest")
    .action(async (ref: string, cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupWorkspaceContext(globalOpts);

      if (cmdOpts.set && cmdOpts.clear) {
        console.error("Use either --set or --clear, not both.");
        process.exit(1);
      }

      try {
        const existing = await getFileInfo(ref, { wsPath: ctx.wsPath, includeDigest: true });
        if (!existing) {
          console.error(`File not found: ${ref}`);
          process.exit(1);
        }

        if (cmdOpts.set || cmdOpts.clear) {
          await update(
            existing.id,
            { digest: cmdOpts.clear ? null : cmdOpts.set },
            { wsPath: ctx.wsPath },
          );

          const updated = await getFileInfo(existing.id, { wsPath: ctx.wsPath, includeDigest: true });
          if (!updated) {
            console.error(`File not found after update: ${existing.id}`);
            process.exit(1);
          }

          if (globalOpts.json) {
            console.log(formatJson({
              file: withoutVector(updated),
              digest: buildDigestPayload(updated),
            }));
            return;
          }

          if (cmdOpts.clear) {
            console.log(`Cleared digest for ${updated.original_name} (${updated.id})`);
            return;
          }

          const payload = buildDigestPayload(updated);
          console.log(`Updated digest for ${updated.original_name} (${payload.wordCount} words)`);
          process.stdout.write(`${payload.digest}\n`);
          return;
        }

        const payload = buildDigestPayload(existing);
        if (globalOpts.json) {
          console.log(formatJson(payload));
          return;
        }

        if (!payload.digest) {
          console.error(`No digest set for ${existing.original_name} (${existing.id})`);
          process.exit(1);
        }

        process.stdout.write(`${payload.digest}\n`);
      } catch (err) {
        console.error(`Digest command error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}