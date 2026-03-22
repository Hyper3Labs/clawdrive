import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, resolveApiKey } from "../src/config.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("loadConfig", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "clawdrive-test-")); });
  afterEach(async () => { await rm(dir, { recursive: true }); });

  it("returns defaults when no config file exists", async () => {
    const config = await loadConfig(join(dir, "config.json"));
    expect(config.version).toBe(1);
    expect(config.default_workspace).toBe("default");
    expect(config.embedding.model).toBe("gemini-embedding-2-preview");
    expect(config.embedding.dimensions).toBe(3072);
    expect(config.store.concurrency).toBe(3);
  });

  it("merges partial config with defaults", async () => {
    await writeFile(join(dir, "config.json"), JSON.stringify({ gemini_api_key: "test-key", store: { concurrency: 5 } }));
    const config = await loadConfig(join(dir, "config.json"));
    expect(config.gemini_api_key).toBe("test-key");
    expect(config.store.concurrency).toBe(5);
    expect(config.embedding.model).toBe("gemini-embedding-2-preview");
  });

  it("rejects invalid config values", async () => {
    await writeFile(join(dir, "config.json"), JSON.stringify({ store: { concurrency: "not-a-number" } }));
    await expect(loadConfig(join(dir, "config.json"))).rejects.toThrow();
  });
});

describe("resolveApiKey", () => {
  it("prefers env var over config", () => {
    expect(resolveApiKey("env-key", "config-key")).toBe("env-key");
  });
  it("falls back to config when no env var", () => {
    expect(resolveApiKey(undefined, "config-key")).toBe("config-key");
  });
  it("returns undefined when neither exists", () => {
    expect(resolveApiKey(undefined, undefined)).toBeUndefined();
  });
});
