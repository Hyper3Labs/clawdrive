import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { getFilePath, getFileInfo } from "@clawdrive/core";
import { setupContext } from "../helpers.js";
import { formatJson } from "../formatters/json.js";

export function registerReadCommand(program: Command) {
  program
    .command("read <id>")
    .description("Read file content by ID")
    .action(async (id: string, _cmdOpts, cmd) => {
      const globalOpts = cmd.parent!.opts();
      const ctx = await setupContext(globalOpts);

      try {
        const info = await getFileInfo(id, { wsPath: ctx.wsPath });
        if (!info) {
          console.error(`File not found: ${id}`);
          process.exit(1);
        }

        const filePath = await getFilePath(id, { wsPath: ctx.wsPath });
        if (!filePath) {
          console.error(`File path not found: ${id}`);
          process.exit(1);
        }

        if (globalOpts.json) {
          console.log(formatJson({
            id: info.id,
            path: filePath,
            contentType: info.content_type,
          }));
          return;
        }

        // For text files, output content to stdout
        const isText = info.content_type.startsWith("text/") ||
          info.content_type === "application/json" ||
          info.content_type === "application/xml" ||
          info.content_type === "application/javascript";

        if (isText) {
          const content = await readFile(filePath, "utf-8");
          process.stdout.write(content);
        } else {
          // For binary files, output the file path
          console.log(filePath);
        }
      } catch (err: any) {
        console.error(`Error reading ${id}: ${err.message}`);
        process.exit(1);
      }
    });
}
