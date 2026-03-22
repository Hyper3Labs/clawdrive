import { exec } from "node:child_process";
import type { Command } from "commander";
import { getFilePath } from "@clawdrive/core";
import { setupContext } from "../helpers.js";

export function registerOpenCommand(program: Command) {
  program
    .command("open <id>")
    .description("Open a stored file with the system default application")
    .action(async (id: string, _cmdOpts, cmd) => {
      const globalOpts = cmd.parent!.opts();
      const ctx = await setupContext(globalOpts);

      try {
        const filePath = await getFilePath(id, { wsPath: ctx.wsPath });
        if (!filePath) {
          console.error(`File not found: ${id}`);
          process.exit(1);
        }

        const platform = process.platform;
        let openCmd: string;

        if (platform === "darwin") {
          openCmd = `open "${filePath}"`;
        } else if (platform === "win32") {
          openCmd = `start "" "${filePath}"`;
        } else {
          openCmd = `xdg-open "${filePath}"`;
        }

        exec(openCmd, (err) => {
          if (err) {
            console.error(`Failed to open file: ${err.message}`);
            process.exit(1);
          }
        });
      } catch (err: any) {
        console.error(`Error opening ${id}: ${err.message}`);
        process.exit(1);
      }
    });
}
