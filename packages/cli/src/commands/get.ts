import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { getFileInfo, getFilePath, getShare, resolveShare } from "@clawdrive/core";
import { formatJson } from "../formatters/json.js";
import { getGlobalOptions, setupWorkspaceContext } from "../helpers.js";

function isTextContentType(contentType: string): boolean {
  return contentType.startsWith("text/") || [
    "application/json",
    "application/xml",
    "application/javascript",
  ].includes(contentType);
}

function withoutVector<T extends { vector?: unknown }>(record: T): Omit<T, "vector"> {
  const { vector: _vector, ...rest } = record;
  return rest;
}

export function registerGetCommand(program: Command) {
  program
    .command("get <ref>")
    .description("Resolve a file ref or share ref to content")
    .action(async (ref: string, _cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupWorkspaceContext(globalOpts);

      try {
        const share = await getShare(ref, { wsPath: ctx.wsPath });
        if (share) {
          if (share.status !== "active") {
            if (globalOpts.json) {
              console.log(formatJson(share));
            } else {
              console.error(`Share ${share.id} is ${share.status}`);
            }
            process.exit(1);
          }

          const resolved = await resolveShare(ref, { wsPath: ctx.wsPath });
          if (!resolved) {
            console.error(`Share not found: ${ref}`);
            process.exit(1);
          }

          if (globalOpts.json) {
            console.log(formatJson({
              share: resolved.share,
              pot: resolved.pot,
              files: resolved.files.map(withoutVector),
            }));
            return;
          }

          console.log(`Pot: ${resolved.pot.name} (${resolved.pot.slug})`);
          console.log(`Share: ${resolved.share.id}`);
          console.log(`Role: ${resolved.share.role}`);
          if (resolved.share.token) {
            console.log(`Token: ${resolved.share.token}`);
          }
          console.log(`Files: ${resolved.files.length}`);
          for (const file of resolved.files) {
            console.log(`- ${file.original_name} ${file.id}`);
          }
          return;
        }

        const info = await getFileInfo(ref, { wsPath: ctx.wsPath, includeDigest: true });
        if (!info) {
          console.error(`Ref not found: ${ref}`);
          process.exit(1);
        }

        const filePath = await getFilePath(info.id, { wsPath: ctx.wsPath });
        if (!filePath) {
          console.error(`File path not found: ${ref}`);
          process.exit(1);
        }

        if (globalOpts.json) {
          console.log(formatJson({
            file: withoutVector(info),
            path: filePath,
          }));
          return;
        }

        if (isTextContentType(info.content_type)) {
          const content = await readFile(filePath, "utf-8");
          process.stdout.write(content.endsWith("\n") ? content : `${content}\n`);
          return;
        }

        console.log(filePath);
      } catch (err) {
        console.error(`Error resolving ${ref}: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}