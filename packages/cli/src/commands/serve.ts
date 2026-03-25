import type { Command } from "commander";
import { createServer } from "@clawdrive/server";
import { parseServerBindings, resolveStaticWebDir, setupServerContext, startPublicShareSurface } from "../server-runtime.js";

export function registerServeCommand(program: Command) {
  program
    .command("serve")
    .description("Start REST API server + web UI")
    .option("--port <port>", "Port number", "7432")
    .option("--host <host>", "Host to bind", "127.0.0.1")
    .option("--public-port <port>", "Optional share-only public surface port")
    .option("--public-host <host>", "Host to bind the share-only public surface")
    .option("--demo <dataset>", "Prepare and launch a curated demo dataset")
    .action(async (cmdOpts, cmd) => {
      const ctx = await setupServerContext(cmd, cmdOpts.demo);
      const bindings = parseServerBindings(cmdOpts);
      const staticDir = await resolveStaticWebDir();

      const app = createServer({
        wsPath: ctx.wsPath,
        embedder: ctx.embedder,
        port: bindings.port,
        host: bindings.host,
        staticDir,
      });

      app.listen(bindings.port, bindings.host, () => {
        console.log(`ClawDrive server running at http://${bindings.host}:${bindings.port}`);
        if (staticDir) {
          console.log(`Web UI available at http://${bindings.host}:${bindings.port}`);
        } else {
          console.log("Web UI not built - run 'npm run build:web' to enable");
        }
        console.log("Press Ctrl+C to stop");
      });

      startPublicShareSurface(ctx.wsPath, bindings);
    });
}
