import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import chalk from "chalk";
import type { Command } from "commander";
import { store } from "@clawdrive/core";
import { setupContext } from "../helpers.js";
import { formatJson } from "../formatters/json.js";

/**
 * Recursively walk a directory and return all file paths matching a glob-like pattern.
 * Supports basic glob: ** /∗ matches all, ∗∗/∗.ext matches by extension.
 */
async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await walkDir(fullPath);
      results.push(...sub);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

function matchGlob(filePath: string, baseDir: string, pattern: string): boolean {
  if (pattern === "**/*") return true;

  const rel = relative(baseDir, filePath);

  // Simple extension matching: **/*.ext
  const extMatch = pattern.match(/^\*\*\/\*(\.\w+)$/);
  if (extMatch) {
    return rel.endsWith(extMatch[1]);
  }

  // Fallback: check if filename includes the pattern (basic substring)
  return rel.includes(pattern.replace(/\*/g, ""));
}

export function registerImportCommand(program: Command) {
  program
    .command("import <dir>")
    .description("Recursively ingest files from a directory")
    .option("--glob <pattern>", "File glob pattern", "**/*")
    .option("--dry-run", "Show what would be imported without storing")
    .action(async (dir: string, cmdOpts, cmd) => {
      const globalOpts = cmd.parent!.opts();
      const ctx = await setupContext(globalOpts);

      try {
        // Walk the directory
        const allFiles = await walkDir(dir);
        const matchingFiles = allFiles.filter((f) => matchGlob(f, dir, cmdOpts.glob));

        if (matchingFiles.length === 0) {
          if (globalOpts.json) {
            console.log(formatJson({ files: 0, status: "no_matches" }));
          } else {
            console.log(chalk.dim("No matching files found."));
          }
          return;
        }

        if (cmdOpts.dryRun) {
          if (globalOpts.json) {
            console.log(formatJson({
              files: matchingFiles.length,
              dryRun: true,
              paths: matchingFiles.map((f) => relative(dir, f)),
            }));
          } else {
            console.log(`Found ${chalk.bold(String(matchingFiles.length))} file(s) to import:`);
            for (const f of matchingFiles) {
              console.log(`  ${relative(dir, f)}`);
            }
            console.log(chalk.dim("\nRun without --dry-run to import."));
          }
          return;
        }

        // Import files one by one with progress
        const results = [];
        let success = 0;
        let failed = 0;
        let duplicates = 0;

        for (let i = 0; i < matchingFiles.length; i++) {
          const file = matchingFiles[i];
          const rel = relative(dir, file);

          if (!globalOpts.json) {
            process.stdout.write(`\r[${i + 1}/${matchingFiles.length}] ${rel}`);
          }

          try {
            const result = await store(
              { sourcePath: file },
              { wsPath: ctx.wsPath, embedder: ctx.embedder },
            );
            results.push({ file: rel, ...result });

            if (result.status === "duplicate") {
              duplicates++;
            } else {
              success++;
            }
          } catch (err: any) {
            failed++;
            results.push({ file: rel, status: "error", error: err.message });
          }
        }

        if (globalOpts.json) {
          console.log(formatJson({ total: matchingFiles.length, success, duplicates, failed, results }));
        } else {
          // Clear progress line
          process.stdout.write("\r" + " ".repeat(80) + "\r");
          console.log(`Import complete: ${chalk.green(`${success} stored`)}, ${chalk.yellow(`${duplicates} duplicates`)}, ${chalk.red(`${failed} failed`)} (${matchingFiles.length} total)`);
        }
      } catch (err: any) {
        console.error(`Error importing from ${dir}: ${err.message}`);
        process.exit(1);
      }
    });
}
