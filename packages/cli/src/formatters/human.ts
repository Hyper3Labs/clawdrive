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
    return `${score} ${name}${chunk}${potLabel} ${chalk.dim(r.id)}`;
  }).join("\n");
}
