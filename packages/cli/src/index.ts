import { Command } from "commander";
import { registerGetCommand } from "./commands/get.js";
import { registerPotCommand } from "./commands/pot.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerServeCommand } from "./commands/serve.js";
import { registerShareCommand } from "./commands/share.js";
import { registerUiCommand } from "./commands/ui.js";

export const program = new Command()
  .name("cdrive")
  .description("Agent-native local file sharing and retrieval")
  .version("0.1.0")
  .option("--json", "Output as JSON")
  .option("--workspace <name>", "Workspace name", "default");

registerPotCommand(program);
registerSearchCommand(program);
registerGetCommand(program);
registerShareCommand(program);
registerServeCommand(program);
registerUiCommand(program);
