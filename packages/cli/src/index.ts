import { createRequire } from "node:module";
import { Command } from "commander";
import { registerAddCommand } from "./commands/add.js";
import { registerCaptionCommand } from "./commands/caption.js";
import { registerDemoCommand } from "./commands/demo.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerDigestCommand } from "./commands/digest.js";
import { registerTranscriptCommand } from "./commands/transcript.js";
import { registerTldrCommand } from "./commands/tldr.js";
import { registerGetCommand } from "./commands/get.js";
import { registerRenameCommand } from "./commands/rename.js";
import { registerPotCommand } from "./commands/pot.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerTodoCommand } from "./commands/todo.js";
import { registerServeCommand } from "./commands/serve.js";
import { registerShareCommand } from "./commands/share.js";
import { registerInstallSkillCommand } from "./commands/install-skill.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

export const program = new Command()
  .name("cdrive")
  .description("Agent-native local file sharing and retrieval")
  .version(version)
  .option("--json", "Output as JSON");

registerAddCommand(program);
registerDemoCommand(program);
registerDoctorCommand(program);
registerPotCommand(program);
registerSearchCommand(program);
registerTodoCommand(program);
registerTldrCommand(program);
registerTranscriptCommand(program);
registerCaptionCommand(program);
registerDigestCommand(program);
registerGetCommand(program);
registerRenameCommand(program);
registerShareCommand(program);
registerServeCommand(program);
registerInstallSkillCommand(program);
