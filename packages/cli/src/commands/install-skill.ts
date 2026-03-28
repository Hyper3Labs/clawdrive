import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { getGlobalOptions } from "../helpers.js";
import { formatJson } from "../formatters/json.js";

type AgentName = "claude" | "copilot" | "codex";

const AGENTS = [
  {
    name: "claude",
    globalRoot: ".claude/skills",
    projectRoot: ".claude/skills",
    markers: [".claude"],
  },
  {
    name: "copilot",
    globalRoot: ".copilot/skills",
    projectRoot: ".github/skills",
    markers: [".copilot", ".github"],
  },
  {
    name: "codex",
    globalRoot: ".agents/skills",
    projectRoot: ".agents/skills",
    markers: [".codex", ".agents"],
  },
] as const;

function resolveSkillDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const pkgRoot = resolve(dirname(thisFile), "..", "..", "..");
  const repoRoot = resolve(pkgRoot, "..", "..");
  const source = join(repoRoot, "skills", "clawdrive");
  if (existsSync(join(source, "SKILL.md"))) return source;

  // In the built package: dist/src/commands/install-skill.js
  // Bundled copy:         skill/SKILL.md (+ sibling .md files)
  const bundled = join(pkgRoot, "skill");
  if (existsSync(join(bundled, "SKILL.md"))) return bundled;
  return source;
}

function detectAgents(projectDir: string): AgentName[] {
  const home = homedir();
  const found = AGENTS.filter((agent) =>
    agent.markers.some((marker) => existsSync(join(home, marker)) || existsSync(join(projectDir, marker))),
  ).map((agent) => agent.name);

  return found.length > 0 ? found : AGENTS.map((agent) => agent.name);
}

function installForAgent(
  agent: AgentName,
  scope: "global" | "project",
  projectDir: string,
  sourceDir: string,
): { path: string; skipped: boolean } {
  const config = AGENTS.find((a) => a.name === agent)!;
  const base = scope === "global" ? homedir() : projectDir;
  const root = scope === "global" ? config.globalRoot : config.projectRoot;
  const destDir = join(base, root, "clawdrive");

  const files = readdirSync(sourceDir).filter((f) => f.endsWith(".md"));
  let allSkipped = true;

  for (const file of files) {
    const src = join(sourceDir, file);
    const dest = join(destDir, file);
    if (existsSync(dest)) {
      const existing = readFileSync(dest, "utf-8");
      const incoming = readFileSync(src, "utf-8");
      if (existing === incoming) continue;
    }
    allSkipped = false;
    mkdirSync(destDir, { recursive: true });
    copyFileSync(src, dest);
  }

  return { path: destDir, skipped: allSkipped };
}

export function registerInstallSkillCommand(program: Command) {
  program
    .command("install-skill")
    .description("Install the ClawDrive agent skill for Claude Code, Codex, or Copilot")
    .option("--agent <name>", "Target agent: claude, copilot, codex (auto-detected if omitted)")
    .option("--global", "Install to home directory (default)")
    .option("--project", "Install into current project directory")
    .action(async (cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const skillDir = resolveSkillDir();

      if (!existsSync(join(skillDir, "SKILL.md"))) {
        console.error(
          "Bundled SKILL.md not found. If running from source, build first with `npm run build`.",
        );
        process.exit(1);
      }

      const scope: "global" | "project" = cmdOpts.project ? "project" : "global";
      const projectDir = process.cwd();

      let agents: AgentName[];
      if (cmdOpts.agent) {
        const name = cmdOpts.agent.toLowerCase() as AgentName;
        if (!AGENTS.some((a) => a.name === name)) {
          console.error(`Unknown agent: ${cmdOpts.agent}. Use: claude, copilot, or codex.`);
          process.exit(1);
        }
        agents = [name];
      } else {
        agents = detectAgents(projectDir);
      }

      const results = agents.map((agent) => {
        const r = installForAgent(agent, scope, projectDir, skillDir);
        return { agent, ...r };
      });

      if (globalOpts.json) {
        console.log(formatJson(results));
        return;
      }

      for (const r of results) {
        if (r.skipped) {
          console.log(`${r.agent}: already up to date → ${r.path}`);
        } else {
          console.log(`${r.agent}: installed → ${r.path}`);
        }
      }
    });
}
