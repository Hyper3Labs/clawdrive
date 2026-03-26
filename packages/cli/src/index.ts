import { Command } from "commander";
import { registerAddCommand } from "./commands/add.js";
import { registerDigestCommand } from "./commands/digest.js";
import { registerTldrCommand } from "./commands/tldr.js";
import { registerGetCommand } from "./commands/get.js";
import { registerRenameCommand } from "./commands/rename.js";
import { registerPotCommand } from "./commands/pot.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerTodoCommand } from "./commands/todo.js";
import { registerServeCommand } from "./commands/serve.js";
import { registerShareCommand } from "./commands/share.js";

export const program = new Command()
  .name("cdrive")
  .description("Agent-native local file sharing and retrieval")
  .version("0.1.0")
  .option("--json", "Output as JSON");

registerAddCommand(program);
registerPotCommand(program);
registerSearchCommand(program);
registerTodoCommand(program);
registerTldrCommand(program);
registerDigestCommand(program);
registerGetCommand(program);
registerRenameCommand(program);
registerShareCommand(program);
registerServeCommand(program);
