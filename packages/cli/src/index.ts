import { Command } from "commander";
import { registerStoreCommand } from "./commands/store.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerReadCommand } from "./commands/read.js";
import { registerInfoCommand } from "./commands/info.js";

export const program = new Command()
  .name("clawdrive")
  .description("Smart file storage for AI agents")
  .version("0.1.0")
  .option("--json", "Output as JSON")
  .option("--workspace <name>", "Workspace name", "default");

registerStoreCommand(program);
registerSearchCommand(program);
registerReadCommand(program);
registerInfoCommand(program);
