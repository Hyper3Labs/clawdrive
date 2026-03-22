import chalk from "chalk";
import type { Command } from "commander";
import { getTaxonomyTree } from "@clawdrive/core";
import type { TaxonomyTreeNode } from "@clawdrive/core";
import { setupContext } from "../helpers.js";
import { formatJson } from "../formatters/json.js";

function renderTree(node: TaxonomyTreeNode, prefix: string = "", isLast: boolean = true, isRoot: boolean = true): string {
  const lines: string[] = [];

  // Current node line
  const connector = isRoot ? "" : isLast ? "└── " : "├── ";
  const label = `${node.label} ${chalk.dim(`(${node.itemCount})`)}`;
  lines.push(`${prefix}${connector}${label}`);

  // Children
  if (node.children && node.children.length > 0) {
    const childPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const childIsLast = i === node.children.length - 1;
      lines.push(renderTree(child, childPrefix, childIsLast, false));
    }
  }

  return lines.join("\n");
}

export function registerTreeCommand(program: Command) {
  program
    .command("tree")
    .description("Show taxonomy hierarchy")
    .action(async (_cmdOpts, cmd) => {
      const globalOpts = cmd.parent!.opts();
      const ctx = await setupContext(globalOpts);

      try {
        const tree = await getTaxonomyTree({ wsPath: ctx.wsPath });

        if (!tree) {
          if (globalOpts.json) {
            console.log(formatJson(null));
          } else {
            console.log(chalk.dim("No taxonomy data. Store some files first."));
          }
          return;
        }

        if (globalOpts.json) {
          console.log(formatJson(tree));
        } else {
          console.log(renderTree(tree));
        }
      } catch (err: any) {
        console.error(`Error loading taxonomy: ${err.message}`);
        process.exit(1);
      }
    });
}
