import chalk from "chalk";

export function formatStoreResult(result: any): string {
  if (result.status === "duplicate") {
    return chalk.yellow(`! Duplicate: ${result.duplicateId}`);
  }
  return chalk.green(`Stored`) + ` ${result.id} (${result.chunks} chunk${result.chunks === 1 ? "" : "s"})`;
}

export function formatSearchResults(results: any[]): string {
  if (results.length === 0) return chalk.dim("No results found.");
  return results.map((r) => {
    const score = chalk.green(r.score.toFixed(2));
    const name = r.file;
    const chunk = r.matchedChunk ? chalk.dim(` (${r.matchedChunk.label})`) : "";
    const tags = r.tags.length > 0 ? chalk.dim(` [${r.tags.join(", ")}]`) : "";
    return `${score} ${name}${chunk}${tags}`;
  }).join("\n");
}

export function formatFileInfo(info: any): string {
  const lines = [
    `${chalk.bold("Name:")} ${info.original_name}`,
    `${chalk.bold("ID:")} ${info.id}`,
    `${chalk.bold("Type:")} ${info.content_type}`,
    `${chalk.bold("Size:")} ${formatBytes(info.file_size)}`,
    `${chalk.bold("Status:")} ${info.status}`,
    `${chalk.bold("Tags:")} ${info.tags.join(", ") || "(none)"}`,
    `${chalk.bold("Created:")} ${new Date(info.created_at).toISOString()}`,
  ];
  if (info.description) lines.push(`${chalk.bold("Description:")} ${info.description}`);
  return lines.join("\n");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
