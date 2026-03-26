import type { Command } from "commander";
import { listTodos, type TodoKind } from "@clawdrive/core";
import { formatJson } from "../formatters/json.js";
import { formatTodoResults } from "../formatters/human.js";
import { getGlobalOptions, setupWorkspaceContext } from "../helpers.js";

function parseTodoKinds(value: string): TodoKind[] {
  const kinds = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const invalid = kinds.filter((kind) => kind !== "tldr" && kind !== "digest" && kind !== "display_name");
  if (invalid.length > 0) {
    throw new Error(`Unsupported todo kinds: ${invalid.join(", ")}`);
  }

  return Array.from(new Set(kinds)) as TodoKind[];
}

export function registerTodoCommand(program: Command) {
  program
    .command("todo")
    .description("List files missing agent-authored metadata")
    .option("--kind <kinds>", "Comma-separated todo kinds: tldr,digest,display_name", parseTodoKinds)
    .option("--limit <n>", "Max todo items to return", (value: string) => parseInt(value, 10), 50)
    .option("--cursor <id>", "Resume after a previous todo item id")
    .action(async (cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupWorkspaceContext(globalOpts);

      try {
        const result = await listTodos(
          {
            kinds: cmdOpts.kind,
            limit: cmdOpts.limit,
            cursor: cmdOpts.cursor,
          },
          { wsPath: ctx.wsPath },
        );

        if (globalOpts.json) {
          console.log(formatJson(result));
          return;
        }

        console.log(formatTodoResults(result));
      } catch (err) {
        console.error(`Todo error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}