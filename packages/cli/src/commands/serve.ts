import type { Command } from "commander";
import { exec } from "node:child_process";
import { createServer } from "@clawdrive/server";
import { prepareDemoWorkspace } from "../demo/nasa.js";
import { parseServerBindings, resolveStaticWebDir, setupServerContext, startPublicShareSurface } from "../server-runtime.js";

async function seedDemo(demo: string, ctx: { wsPath: string; embedder: import("@clawdrive/core").EmbeddingProvider }) {
  try {
    await prepareDemoWorkspace(demo, ctx);
  } catch (err) {
    console.error(`[demo] seeding failed: ${err}`);
  }
}

export function registerServeCommand(program: Command) {
  program
    .command("serve")
    .description("Start REST API server + web UI")
    .option("--port <port>", "Port number", "7432")
    .option("--host <host>", "Host to bind", "127.0.0.1")
    .option("--public-port <port>", "Optional share-only public surface port")
    .option("--public-host <host>", "Host to bind the share-only public surface")
    .option("--demo <dataset>", "Prepare and launch a curated demo dataset")
    .option("--read-only", "Block all mutations (read-only mode)")
    .option("--open", "Open browser after starting")
    .action(async (cmdOpts, cmd) => {
      const ctx = await setupServerContext(cmd);
      const bindings = parseServerBindings(cmdOpts);
      const staticDir = await resolveStaticWebDir();

      const app = createServer({
        wsPath: ctx.wsPath,
        embedder: ctx.embedder,
        port: bindings.port,
        host: bindings.host,
        staticDir,
        readOnly: Boolean(cmdOpts.readOnly),
      });

      app.listen(bindings.port, bindings.host, () => {
        const url = `http://${bindings.host === "0.0.0.0" ? "localhost" : bindings.host}:${bindings.port}`;
        console.log(`ClawDrive server running at ${url}`);
        if (staticDir) {
          console.log(`Web UI available at ${url}`);
        } else {
          console.log("Web UI not built - run 'npm run build:web' to enable");
        }
        console.log("Press Ctrl+C to stop");

        if (cmdOpts.open) {
          let openCmd: string;
          switch (process.platform) {
            case "darwin": openCmd = "open"; break;
            case "win32": openCmd = "start"; break;
            default: openCmd = "xdg-open"; break;
          }
          exec(`${openCmd} ${url}`);
        }

        // Seed demo data in the background after server is listening
        if (cmdOpts.demo) {
          seedDemo(cmdOpts.demo, ctx);
        }
      });

      startPublicShareSurface(ctx.wsPath, bindings);
    });
}
