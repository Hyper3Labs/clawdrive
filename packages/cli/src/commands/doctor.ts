import chalk from "chalk";
import type { Command } from "commander";
import { doctor } from "@clawdrive/core";
import { setupContext } from "../helpers.js";
import { formatJson } from "../formatters/json.js";

export function registerDoctorCommand(program: Command) {
  program
    .command("doctor")
    .description("Run health checks on the workspace")
    .action(async (_cmdOpts, cmd) => {
      const globalOpts = cmd.parent!.opts();
      const ctx = await setupContext(globalOpts);

      try {
        const result = await doctor({ wsPath: ctx.wsPath });

        if (globalOpts.json) {
          console.log(formatJson(result));
          return;
        }

        if (result.healthy) {
          console.log(chalk.green("Healthy") + " — no issues found.");
        } else {
          console.log(chalk.red("Unhealthy") + ` — ${result.issues.length} issue(s) found:\n`);
          for (const issue of result.issues) {
            console.log(`  ${chalk.yellow("•")} ${issue}`);
          }
        }
      } catch (err: any) {
        console.error(`Error running doctor: ${err.message}`);
        process.exit(1);
      }
    });
}
