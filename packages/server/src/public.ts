import { createAppShell } from "./app.js";
import { errorHandler } from "./middleware/error.js";
import { createPublicShareRoutes } from "./routes/public-shares.js";

export interface PublicShareServerOptions {
  wsPath: string;
}

export function createPublicShareServer(opts: PublicShareServerOptions) {
  const app = createAppShell();

  app.use("/s", createPublicShareRoutes(opts.wsPath));

  app.use(errorHandler);
  return app;
}