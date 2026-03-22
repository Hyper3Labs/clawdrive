import type { Command } from "commander";
import { createServer } from "@clawdrive/server";
import { setupContext } from "../helpers.js";

export function registerServeCommand(program: Command) {
  program
    .command("serve")
    .description("Start REST API server + web UI")
    .option("--port <port>", "Port number", "7432")
    .option("--host <host>", "Host to bind", "127.0.0.1")
    .action(async (cmdOpts, cmd) => {
      const globalOpts = cmd.parent!.opts();
      const ctx = await setupContext(globalOpts);

      const port = parseInt(cmdOpts.port);
      const host = cmdOpts.host;

      // Try to find the web UI build
      // It would be at packages/web/dist relative to the package, or bundled
      // For now, staticDir is optional
      let staticDir: string | undefined;
      try {
        // Attempt to resolve @clawdrive/web dist path
        const { createRequire } = await import("node:module");
        const require = createRequire(import.meta.url);
        const webPkg = require.resolve("@clawdrive/web/package.json");
        const { dirname, join } = await import("node:path");
        const webDist = join(dirname(webPkg), "dist");
        const { stat } = await import("node:fs/promises");
        await stat(webDist);
        staticDir = webDist;
      } catch {
        // Web UI not built or not available — serve API only
      }

      const app = createServer({
        wsPath: ctx.wsPath,
        embedder: ctx.embedder,
        port,
        host,
        staticDir,
      });

      app.listen(port, host, () => {
        console.log(`ClawDrive server running at http://${host}:${port}`);
        if (staticDir) {
          console.log(`Web UI available at http://${host}:${port}`);
        } else {
          console.log("Web UI not built — run 'npm run build:web' to enable");
        }
        console.log("Press Ctrl+C to stop");
      });
    });
}
