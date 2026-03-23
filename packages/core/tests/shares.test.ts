import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MockEmbeddingProvider } from "../src/embedding/mock.js";
import { buildPotTag } from "../src/metadata.js";
import { createPot } from "../src/pots.js";
import { approveShare, createPotShare, listShareInbox, resolveShare, revokeShare } from "../src/shares.js";
import { store } from "../src/store.js";
import { createTestWorkspace } from "./helpers.js";

describe("shares", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  let embedder: MockEmbeddingProvider;

  beforeEach(async () => {
    ctx = await createTestWorkspace();
    embedder = new MockEmbeddingProvider(3072);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("creates link shares that require approval", async () => {
    const pot = await createPot({ name: "Acme DD" }, { wsPath: ctx.wsPath });
    const src = join(ctx.baseDir, "brief.md");
    await writeFile(src, "brief text");
    await store(
      {
        sourcePath: src,
        tags: [buildPotTag(pot.slug)],
      },
      { wsPath: ctx.wsPath, embedder },
    );

    const pending = await createPotShare(
      { pot: pot.slug, kind: "link", role: "read" },
      { wsPath: ctx.wsPath },
    );
    expect(pending.status).toBe("pending");

    const inbox = await listShareInbox({ wsPath: ctx.wsPath });
    expect(inbox).toHaveLength(1);
    expect(inbox[0].id).toBe(pending.id);

    const approved = await approveShare(pending.id, { wsPath: ctx.wsPath });
    expect(approved.status).toBe("active");
    expect(approved.token).toBeTruthy();

    const resolved = await resolveShare(approved.token!, { wsPath: ctx.wsPath });
    expect(resolved?.pot.slug).toBe(pot.slug);
    expect(resolved?.files).toHaveLength(1);
  });

  it("revokes direct shares", async () => {
    const pot = await createPot({ name: "Acme DD" }, { wsPath: ctx.wsPath });
    const share = await createPotShare(
      { pot: pot.slug, kind: "principal", principal: "claude-code", role: "write" },
      { wsPath: ctx.wsPath },
    );

    expect(share.status).toBe("active");

    const revoked = await revokeShare(share.id, { wsPath: ctx.wsPath });
    expect(revoked.status).toBe("revoked");

    const resolved = await resolveShare(share.id, { wsPath: ctx.wsPath });
    expect(resolved).toBeNull();
  });
});