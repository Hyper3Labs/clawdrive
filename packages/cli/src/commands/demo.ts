import type { Command } from "commander";
import { formatJson } from "../formatters/json.js";
import { prepareDemoWorkspace } from "../demo/nasa.js";
import { getGlobalOptions, setupContext } from "../helpers.js";

export function registerDemoCommand(program: Command) {
  const demo = program
    .command("demo")
    .description("Install curated sample content into the current workspace");

  demo
    .command("install <dataset>")
    .description("Install a curated demo dataset and create its pot")
    .action(async (dataset: string, _cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupContext(globalOpts);

      try {
        const result = await prepareDemoWorkspace(dataset, ctx);
        if (!result) {
          throw new Error(`Unsupported demo dataset: ${dataset}`);
        }

        if (globalOpts.json) {
          console.log(formatJson(result));
        } else if (result.alreadyInstalled) {
          console.log(`Demo pot ${result.pot} is already installed`);
        } else {
          console.log(
            `Installed demo pot ${result.pot}: ${result.stored} stored, ${result.attached} attached, ${result.existing} already present, ${result.failed} failed`,
          );
        }

        if (result.failed > 0) {
          process.exitCode = 1;
        }
      } catch (err) {
        console.error(`Error installing demo dataset: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
