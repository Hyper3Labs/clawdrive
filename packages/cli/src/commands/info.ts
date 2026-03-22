import type { Command } from "commander";
import { getFileInfo } from "@clawdrive/core";
import { setupContext } from "../helpers.js";
import { formatJson } from "../formatters/json.js";
import { formatFileInfo } from "../formatters/human.js";

export function registerInfoCommand(program: Command) {
  program
    .command("info <id>")
    .description("Show metadata for a stored file")
    .action(async (id: string, _cmdOpts, cmd) => {
      const globalOpts = cmd.parent!.opts();
      const ctx = await setupContext(globalOpts);

      try {
        const info = await getFileInfo(id, { wsPath: ctx.wsPath });
        if (!info) {
          console.error(`File not found: ${id}`);
          process.exit(1);
        }

        if (globalOpts.json) {
          // Exclude the vector from JSON output (too large / not useful for CLI)
          const { vector, ...rest } = info;
          console.log(formatJson(rest));
        } else {
          console.log(formatFileInfo(info));
        }
      } catch (err: any) {
        console.error(`Error fetching info for ${id}: ${err.message}`);
        process.exit(1);
      }
    });
}
