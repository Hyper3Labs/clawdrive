import type { Command } from "commander";
import { createPublicShareServer } from "@clawdrive/server";
import { NASA_DEMO_WORKSPACE, prepareDemoWorkspace } from "./demo/nasa.js";
import { getGlobalOptions, setupContext } from "./helpers.js";

export interface ServerBindings {
  port: number;
  host: string;
  publicPort?: number;
  publicHost: string;
}

export function parseServerBindings(cmdOpts: {
  port: string;
  host: string;
  publicPort?: string;
  publicHost?: string;
}): ServerBindings {
  const port = parseInt(cmdOpts.port, 10);
  const host = cmdOpts.host;
  const publicPort = cmdOpts.publicPort ? parseInt(cmdOpts.publicPort, 10) : undefined;
  const publicHost = cmdOpts.publicHost || host;

  if (publicPort != null && publicPort === port && publicHost === host) {
    throw new Error("Public share surface must bind to a different host or port than the main server");
  }

  return {
    port,
    host,
    publicPort,
    publicHost,
  };
}

export async function setupServerContext(cmd: Command, demo?: string) {
  const globalOpts = getGlobalOptions(cmd);
  const workspaceName = demo === "nasa" ? NASA_DEMO_WORKSPACE : undefined;
  const ctx = await setupContext(globalOpts, workspaceName);
  await prepareDemoWorkspace(demo, ctx);
  return ctx;
}

export async function resolveStaticWebDir(): Promise<string | undefined> {
  try {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const webPkg = require.resolve("@clawdrive/web/package.json");
    const { dirname, join } = await import("node:path");
    const webDist = join(dirname(webPkg), "dist");
    const { stat } = await import("node:fs/promises");
    await stat(webDist);
    return webDist;
  } catch {
    return undefined;
  }
}

export function startPublicShareSurface(wsPath: string, bindings: ServerBindings): void {
  if (bindings.publicPort == null) {
    return;
  }

  const publicApp = createPublicShareServer({ wsPath });
  publicApp.listen(bindings.publicPort, bindings.publicHost, () => {
    console.log(`Public share surface running at http://${bindings.publicHost}:${bindings.publicPort}/s/<token>`);
  });
}