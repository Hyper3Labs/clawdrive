import chalk from "chalk";
import type { Command } from "commander";
import { getUsage } from "@clawdrive/core";
import { setupContext } from "../helpers.js";
import { formatJson } from "../formatters/json.js";

export function registerUsageCommand(program: Command) {
  program
    .command("usage")
    .description("Show API usage statistics")
    .action(async (_cmdOpts, cmd) => {
      const globalOpts = cmd.parent!.opts();
      const ctx = await setupContext(globalOpts);

      try {
        const usage = await getUsage(ctx.wsPath);

        if (globalOpts.json) {
          console.log(formatJson(usage));
          return;
        }

        console.log(`${chalk.bold("Total tokens:")}  ${usage.totalTokens.toLocaleString()}`);
        console.log(`${chalk.bold("Est. cost:")}     $${usage.estimatedCost.toFixed(4)}`);
        console.log(`${chalk.bold("API calls:")}     ${usage.entries}`);
      } catch (err: any) {
        console.error(`Error reading usage: ${err.message}`);
        process.exit(1);
      }
    });
}
