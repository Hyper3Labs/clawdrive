import type { Command } from "commander";
import chalk from "chalk";
import { join } from "node:path";
import { doctor } from "@clawdrive/core";
import { formatJson } from "../formatters/json.js";
import { getGlobalOptions, setupWorkspaceContext } from "../helpers.js";

export function registerDoctorCommand(program: Command) {
  program
    .command("doctor")
    .description("Health-check the workspace and report issues")
    .action(async (_cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupWorkspaceContext(globalOpts);

      try {
        const configPath = join(ctx.baseDir, "config.json");
        const result = await doctor({
          wsPath: ctx.wsPath,
          configPath,
          envApiKey: process.env.GEMINI_API_KEY,
        });

        if (globalOpts.json) {
          console.log(formatJson(result));
          return;
        }

        if (result.healthy) {
          console.log(chalk.green("Healthy — no issues found."));
        } else {
          console.log(chalk.yellow(`Found ${result.issues.length} issue(s):\n`));
          for (const issue of result.issues) {
            console.log(`  ${chalk.red("•")} ${issue}`);
          }
        }
      } catch (err) {
        console.error(`Doctor error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
