import type { Command } from "commander";
import { exec } from "node:child_process";
import { createServer } from "@clawdrive/server";
import { prepareDemoWorkspace, resolveWorkspaceForDemo } from "../demo/nasa.js";
import { setupContext } from "../helpers.js";

export function registerUiCommand(program: Command) {
  program
    .command("ui")
    .description("Start server + open browser")
    .option("--port <port>", "Port number", "7432")
    .option("--host <host>", "Host to bind", "127.0.0.1")
    .option("--demo <dataset>", "Prepare and launch a curated demo dataset")
    .action(async (cmdOpts, cmd) => {
      const command = cmd.parent!;
      const globalOpts = command.opts();
      const workspaceSource = command.getOptionValueSource?.("workspace");
      const workspace = resolveWorkspaceForDemo(
        globalOpts.workspace,
        cmdOpts.demo,
        workspaceSource,
      );
      const ctx = await setupContext({ ...globalOpts, workspace });
      await prepareDemoWorkspace(cmdOpts.demo, ctx);

      const port = parseInt(cmdOpts.port);
      const host = cmdOpts.host;

      let staticDir: string | undefined;
      try {
        const { createRequire } = await import("node:module");
        const require = createRequire(import.meta.url);
        const webPkg = require.resolve("@clawdrive/web/package.json");
        const { dirname, join } = await import("node:path");
        staticDir = join(dirname(webPkg), "dist");
        const { stat } = await import("node:fs/promises");
        await stat(staticDir);
      } catch {
        staticDir = undefined;
      }

      const app = createServer({
        wsPath: ctx.wsPath,
        embedder: ctx.embedder,
        port,
        host,
        staticDir,
      });

      app.listen(port, host, () => {
        const url = `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`;
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
    });
}
