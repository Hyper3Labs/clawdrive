import type { Command } from "commander";
import { remove } from "@clawdrive/core";
import { setupContext } from "../helpers.js";
import { formatJson } from "../formatters/json.js";

export function registerRmCommand(program: Command) {
  program
    .command("rm <id>")
    .description("Soft-delete a stored file")
    .action(async (id: string, _cmdOpts, cmd) => {
      const globalOpts = cmd.parent!.opts();
      const ctx = await setupContext(globalOpts);

      try {
        await remove(id, { wsPath: ctx.wsPath });

        if (globalOpts.json) {
          console.log(formatJson({ id, status: "deleted" }));
        } else {
          console.log(`Deleted ${id}`);
        }
      } catch (err: any) {
        console.error(`Error deleting ${id}: ${err.message}`);
        process.exit(1);
      }
    });
}
