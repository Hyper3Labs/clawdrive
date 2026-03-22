// packages/core/src/lock.ts
import { lock } from "proper-lockfile";
import { join } from "node:path";

export async function acquireLock(wsPath: string): Promise<() => Promise<void>> {
  const lockPath = join(wsPath, "db");
  const release = await lock(lockPath, {
    retries: { retries: 5, minTimeout: 200, maxTimeout: 5000 },
    stale: 30000,
  });
  return release;
}
