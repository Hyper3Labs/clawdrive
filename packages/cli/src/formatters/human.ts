import chalk from "chalk";
import { extractPotSlugs } from "@clawdrive/core";

export function formatSearchResults(results: any[]): string {
  if (results.length === 0) return chalk.dim("No results found.");
  return results.map((r) => {
    const score = chalk.green(r.score.toFixed(2));
    const name = r.file;
    const chunk = r.matchedChunk ? chalk.dim(` (${r.matchedChunk.label})`) : "";
    const pots = extractPotSlugs(r.tags ?? []);
    const potLabel = pots.length > 0 ? chalk.dim(` {${pots.join(", ")}}`) : "";
    const tldr = r.tldr ?? r.abstract ?? r.description;
    const summary = tldr ? `\n  ${chalk.dim(tldr)}` : "";
    return `${score} ${name}${chunk}${potLabel}${summary}`;
  }).join("\n");
}

export function formatTodoResults(result: { items: Array<{ name: string; originalName: string; missing: string[] }>; nextCursor?: string }): string {
  if (result.items.length === 0) {
    return chalk.dim("No todo items.");
  }

  const lines = result.items.map((item) => (
    `missing:${item.missing.join(",")} ${item.name}`
  ));

  if (result.nextCursor) {
    lines.push(chalk.dim(`next:${result.nextCursor}`));
  }

  return lines.join("\n");
}
