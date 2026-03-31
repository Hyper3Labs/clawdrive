import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { store } from "../src/store.js";
import { listTodos } from "../src/todo.js";
import { createTestWorkspace, writeSilentWav, writeTinyPng } from "./helpers.js";
import { MockEmbeddingProvider } from "../src/embedding/mock.js";
import { createPot } from "../src/pots.js";
import { buildPotTag } from "../src/metadata.js";

describe("todo", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  let embedder: MockEmbeddingProvider;

  beforeEach(async () => {
    ctx = await createTestWorkspace();
    embedder = new MockEmbeddingProvider(3072);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("lists files missing tldr, digest, and display_name", async () => {
    const missingSrc = join(ctx.baseDir, "missing.md");
    const tldrOnlySrc = join(ctx.baseDir, "tldr-only.md");
    const completeSrc = join(ctx.baseDir, "complete.md");
    const audioSrc = join(ctx.baseDir, "meeting.wav");
    const transcribedAudioSrc = join(ctx.baseDir, "transcribed-meeting.wav");
    const imageSrc = join(ctx.baseDir, "photo.png");
    const captionedImageSrc = join(ctx.baseDir, "captioned-photo.png");

    await writeFile(missingSrc, "first file content");
    await writeFile(tldrOnlySrc, "second file content");
    await writeFile(completeSrc, "third file content");
    await writeSilentWav(audioSrc);
    await writeSilentWav(transcribedAudioSrc);
    await writeTinyPng(imageSrc);
    await writeTinyPng(captionedImageSrc);

    const missing = await store({ sourcePath: missingSrc }, { wsPath: ctx.wsPath, embedder });
    const tldrOnly = await store(
      {
        sourcePath: tldrOnlySrc,
        tldr: "Short summary for the second file.",
      },
      { wsPath: ctx.wsPath, embedder },
    );
    const missingTranscript = await store(
      {
        sourcePath: audioSrc,
        originalName: "meeting.wav",
      },
      { wsPath: ctx.wsPath, embedder },
    );
    const missingCaption = await store(
      {
        sourcePath: imageSrc,
        originalName: "photo.png",
      },
      { wsPath: ctx.wsPath, embedder },
    );
    await store(
      {
        sourcePath: completeSrc,
        tldr: "Short summary for the complete file.",
        digest: "# Digest\n\nOpening paragraph.\n\n## Quick Navigation\n- One\n\n## Detailed Description\nDone.",
        displayName: "Complete file",
      },
      { wsPath: ctx.wsPath, embedder },
    );
    await store(
      {
        sourcePath: transcribedAudioSrc,
        originalName: "transcribed-meeting.wav",
        transcript: "Speaker 1: Transcript is present.",
        tldr: "Meeting audio.",
        digest: "# Digest\n\nAudio notes.",
        displayName: "Transcribed meeting.wav",
      },
      { wsPath: ctx.wsPath, embedder },
    );
    await store(
      {
        sourcePath: captionedImageSrc,
        originalName: "captioned-photo.png",
        caption: "A tiny transparent pixel used as an image fixture.",
        tldr: "Fixture image.",
        digest: "# Digest\n\nImage notes.",
        displayName: "Captioned photo.png",
      },
      { wsPath: ctx.wsPath, embedder },
    );

    const result = await listTodos({ limit: 10 }, { wsPath: ctx.wsPath });

    expect(result.total).toBe(4);

    const missingItem = result.items.find((item) => item.id === missing.id);
    const tldrOnlyItem = result.items.find((item) => item.id === tldrOnly.id);
    const missingTranscriptItem = result.items.find((item) => item.id === missingTranscript.id);
    const missingCaptionItem = result.items.find((item) => item.id === missingCaption.id);

    expect(missingItem?.missing).toEqual(["tldr", "digest", "display_name"]);
    expect(tldrOnlyItem?.missing).toEqual(["digest", "display_name"]);
    expect(missingTranscriptItem?.missing).toEqual(["tldr", "transcript", "digest", "display_name"]);
    expect(missingCaptionItem?.missing).toEqual(["tldr", "caption", "digest", "display_name"]);
  });

  it("filters by kind and paginates todo items", async () => {
    for (const fileName of ["a.md", "b.md", "c.md"]) {
      const sourcePath = join(ctx.baseDir, fileName);
      await writeFile(sourcePath, `${fileName} content`);
      await store(
        {
          sourcePath,
          tldr: `Short summary for ${fileName}.`,
        },
        { wsPath: ctx.wsPath, embedder },
      );
    }

    const page1 = await listTodos({ kinds: ["digest"], limit: 2 }, { wsPath: ctx.wsPath });
    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page1.items.every((item) => item.missing.every((kind) => kind === "digest"))).toBe(true);
    expect(page1.nextCursor).toBeDefined();

    const page2 = await listTodos(
      { kinds: ["digest"], limit: 2, cursor: page1.nextCursor },
      { wsPath: ctx.wsPath },
    );
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeUndefined();
  });

  it("filters display_name todos independently", async () => {
    const missingDisplayNameSrc = join(ctx.baseDir, "missing-display-name.md");
    const completeSrc = join(ctx.baseDir, "named.md");

    await writeFile(missingDisplayNameSrc, "first file content");
    await writeFile(completeSrc, "second file content");

    const missingDisplayName = await store(
      {
        sourcePath: missingDisplayNameSrc,
        tldr: "Short summary for the unnamed file.",
        digest: "# Digest\n\nOpening paragraph.\n\n## Quick Navigation\n- One\n\n## Detailed Description\nDone.",
      },
      { wsPath: ctx.wsPath, embedder },
    );

    await store(
      {
        sourcePath: completeSrc,
        tldr: "Short summary for the named file.",
        digest: "# Digest\n\nOpening paragraph.\n\n## Quick Navigation\n- One\n\n## Detailed Description\nDone.",
        displayName: "Named file",
      },
      { wsPath: ctx.wsPath, embedder },
    );

    const result = await listTodos({ kinds: ["display_name"], limit: 10 }, { wsPath: ctx.wsPath });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(missingDisplayName.id);
    expect(result.items[0]?.missing).toEqual(["display_name"]);
  });

  it("filters transcript todos to audio and video files", async () => {
    const textSrc = join(ctx.baseDir, "notes.md");
    const audioSrc = join(ctx.baseDir, "call.wav");

    await writeFile(textSrc, "notes");
    await writeSilentWav(audioSrc);

    await store({ sourcePath: textSrc }, { wsPath: ctx.wsPath, embedder });
    const audio = await store(
      {
        sourcePath: audioSrc,
        originalName: "call.wav",
      },
      { wsPath: ctx.wsPath, embedder },
    );

    const result = await listTodos({ kinds: ["transcript"], limit: 10 }, { wsPath: ctx.wsPath });

    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe(audio.id);
    expect(result.items[0]?.missing).toEqual(["transcript"]);
  });

  it("filters caption todos to image files", async () => {
    const textSrc = join(ctx.baseDir, "notes.md");
    const imageSrc = join(ctx.baseDir, "photo.png");

    await writeFile(textSrc, "notes");
    await writeTinyPng(imageSrc);

    await store({ sourcePath: textSrc }, { wsPath: ctx.wsPath, embedder });
    const image = await store(
      {
        sourcePath: imageSrc,
        originalName: "photo.png",
      },
      { wsPath: ctx.wsPath, embedder },
    );

    const result = await listTodos({ kinds: ["caption"], limit: 10 }, { wsPath: ctx.wsPath });

    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe(image.id);
    expect(result.items[0]?.missing).toEqual(["caption"]);
  });

  it("filters todos by pot", async () => {
    const pot = await createPot({ name: "filter-pot" }, { wsPath: ctx.wsPath });

    const inPotSrc = join(ctx.baseDir, "in-pot.md");
    const outsideSrc = join(ctx.baseDir, "outside.md");
    await writeFile(inPotSrc, "in pot content");
    await writeFile(outsideSrc, "outside content");

    await store(
      { sourcePath: inPotSrc, tags: [buildPotTag(pot.slug)] },
      { wsPath: ctx.wsPath, embedder },
    );
    await store(
      { sourcePath: outsideSrc },
      { wsPath: ctx.wsPath, embedder },
    );

    const allTodos = await listTodos({ kinds: ["tldr"] }, { wsPath: ctx.wsPath });
    expect(allTodos.items.length).toBeGreaterThanOrEqual(2);

    const potTodos = await listTodos(
      { kinds: ["tldr"], pot: pot.slug },
      { wsPath: ctx.wsPath },
    );
    expect(potTodos.items).toHaveLength(1);
    expect(potTodos.items[0].name).toContain("in-pot");
  });
});