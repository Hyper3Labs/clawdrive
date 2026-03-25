import type { Command } from "commander";
import { exec } from "node:child_process";
import { createServer } from "@clawdrive/server";
import { parseServerBindings, resolveStaticWebDir, setupServerContext, startPublicShareSurface } from "../server-runtime.js";

export function registerUiCommand(program: Command) {
  program
    .command("ui")
    .description("Start server + open browser")
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
        const url = `http://${bindings.host === "0.0.0.0" ? "localhost" : bindings.host}:${bindings.port}`;
        console.log(`ClawDrive server running at ${url}`);

        // Open browser
        const platform = process.platform;
        const openCmd =
          platform === "darwin"
            ? "open"
            : platform === "win32"
              ? "start"
              : "xdg-open";
        exec(`${openCmd} ${url}`);
      });

      startPublicShareSurface(ctx.wsPath, bindings);
    });
}
