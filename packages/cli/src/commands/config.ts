import { join } from "node:path";
import type { Command } from "commander";
import { loadConfig, saveConfig } from "@clawdrive/core";
import { getBaseDir } from "../helpers.js";
import { formatJson } from "../formatters/json.js";

export function registerConfigCommand(program: Command) {
  const configCmd = program
    .command("config")
    .description("Manage ClawDrive configuration");

  configCmd
    .command("get <key>")
    .description("Get a config value")
    .action(async (key: string, _cmdOpts, cmd) => {
      const globalOpts = cmd.parent!.parent!.opts();
      const baseDir = getBaseDir();
      const configPath = join(baseDir, "config.json");

      try {
        const config = await loadConfig(configPath);
        const value = getNestedValue(config, key);

        if (globalOpts.json) {
          console.log(formatJson({ key, value }));
        } else {
          if (value === undefined) {
            console.log(`(not set)`);
          } else if (typeof value === "object") {
            console.log(JSON.stringify(value, null, 2));
          } else {
            console.log(String(value));
          }
        }
      } catch (err: any) {
        console.error(`Error reading config: ${err.message}`);
        process.exit(1);
      }
    });

  configCmd
    .command("set <key> <value>")
    .description("Set a config value")
    .action(async (key: string, value: string, _cmdOpts, cmd) => {
      const globalOpts = cmd.parent!.parent!.opts();
      const baseDir = getBaseDir();
      const configPath = join(baseDir, "config.json");

      try {
        const config = await loadConfig(configPath);
        const parsed = parseValue(value);
        setNestedValue(config, key, parsed);
        await saveConfig(configPath, config);

        if (globalOpts.json) {
          console.log(formatJson({ key, value: parsed, status: "saved" }));
        } else {
          console.log(`Set ${key} = ${value}`);
        }
      } catch (err: any) {
        console.error(`Error saving config: ${err.message}`);
        process.exit(1);
      }
    });

  configCmd
    .command("set-key <key>")
    .description("Set the Gemini API key")
    .action(async (key: string, _cmdOpts, cmd) => {
      const globalOpts = cmd.parent!.parent!.opts();
      const baseDir = getBaseDir();
      const configPath = join(baseDir, "config.json");

      try {
        const config = await loadConfig(configPath);
        config.gemini_api_key = key;
        await saveConfig(configPath, config);

        if (globalOpts.json) {
          console.log(formatJson({ status: "saved" }));
        } else {
          console.log("API key saved.");
        }
      } catch (err: any) {
        console.error(`Error saving API key: ${err.message}`);
        process.exit(1);
      }
    });
}

function getNestedValue(obj: any, key: string): unknown {
  const parts = key.split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function setNestedValue(obj: any, key: string, value: unknown): void {
  const parts = key.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] == null || typeof current[parts[i]] !== "object") {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

function parseValue(val: string): unknown {
  if (val === "true") return true;
  if (val === "false") return false;
  const num = Number(val);
  if (!isNaN(num) && val.trim() !== "") return num;
  return val;
}
