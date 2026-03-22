import type { Command } from "commander";
import { update, getFileInfo } from "@clawdrive/core";
import { setupContext } from "../helpers.js";
import { formatJson } from "../formatters/json.js";

export function registerUpdateCommand(program: Command) {
  program
    .command("update <id>")
    .description("Update file metadata (tags, description)")
    .option("--tags <tags>", "Replace all tags (comma-separated)", (val: string) => val.split(","))
    .option("--desc <description>", "Set description")
    .option("--add-tag <tag>", "Add a single tag")
    .option("--rm-tag <tag>", "Remove a single tag")
    .action(async (id: string, cmdOpts, cmd) => {
      const globalOpts = cmd.parent!.opts();
      const ctx = await setupContext(globalOpts);

      try {
        const changes: { tags?: string[]; description?: string } = {};

        if (cmdOpts.tags) {
          changes.tags = cmdOpts.tags;
        }

        if (cmdOpts.addTag || cmdOpts.rmTag) {
          // Need current info to modify tags
          const info = await getFileInfo(id, { wsPath: ctx.wsPath });
          if (!info) {
            console.error(`File not found: ${id}`);
            process.exit(1);
          }

          let currentTags = [...info.tags];
          if (cmdOpts.addTag && !currentTags.includes(cmdOpts.addTag)) {
            currentTags.push(cmdOpts.addTag);
          }
          if (cmdOpts.rmTag) {
            currentTags = currentTags.filter((t: string) => t !== cmdOpts.rmTag);
          }
          changes.tags = currentTags;
        }

        if (cmdOpts.desc !== undefined) {
          changes.description = cmdOpts.desc;
        }

        await update(id, changes, { wsPath: ctx.wsPath });

        if (globalOpts.json) {
          console.log(formatJson({ id, status: "updated", changes }));
        } else {
          console.log(`Updated ${id}`);
        }
      } catch (err: any) {
        console.error(`Error updating ${id}: ${err.message}`);
        process.exit(1);
      }
    });
}
