import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const repoRoot = resolve(packageRoot, "..", "..");
const source = resolve(repoRoot, "skills", "clawdrive", "SKILL.md");
const destination = resolve(packageRoot, "skill", "SKILL.md");

if (!existsSync(source)) {
  throw new Error(`Skill source not found: ${source}`);
}

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);