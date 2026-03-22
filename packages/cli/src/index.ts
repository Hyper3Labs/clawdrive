import { Command } from "commander";
import { registerStoreCommand } from "./commands/store.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerReadCommand } from "./commands/read.js";
import { registerInfoCommand } from "./commands/info.js";
import { registerRmCommand } from "./commands/rm.js";
import { registerUpdateCommand } from "./commands/update.js";
import { registerExportCommand } from "./commands/export.js";
import { registerOpenCommand } from "./commands/open.js";
import { registerLsCommand } from "./commands/ls.js";
import { registerTreeCommand } from "./commands/tree.js";
import { registerImportCommand } from "./commands/import.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerGcCommand } from "./commands/gc.js";
import { registerUsageCommand } from "./commands/usage.js";
import { registerServeCommand } from "./commands/serve.js";
import { registerUiCommand } from "./commands/ui.js";

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
registerRmCommand(program);
registerUpdateCommand(program);
registerExportCommand(program);
registerOpenCommand(program);
registerLsCommand(program);
registerTreeCommand(program);
registerImportCommand(program);
registerConfigCommand(program);
registerDoctorCommand(program);
registerGcCommand(program);
registerUsageCommand(program);
registerServeCommand(program);
registerUiCommand(program);
