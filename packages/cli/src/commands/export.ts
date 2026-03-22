import type { Command } from "commander";
import { exportFile } from "@clawdrive/core";
import { setupContext } from "../helpers.js";
import { formatJson } from "../formatters/json.js";

export function registerExportCommand(program: Command) {
  program
    .command("export <id> <dest>")
    .description("Copy a stored file to a destination path")
    .action(async (id: string, dest: string, _cmdOpts, cmd) => {
      const globalOpts = cmd.parent!.opts();
      const ctx = await setupContext(globalOpts);

      try {
        await exportFile(id, dest, { wsPath: ctx.wsPath });

        if (globalOpts.json) {
          console.log(formatJson({ id, dest, status: "exported" }));
        } else {
          console.log(`Exported ${id} -> ${dest}`);
        }
      } catch (err: any) {
        console.error(`Error exporting ${id}: ${err.message}`);
        process.exit(1);
      }
    });
}
