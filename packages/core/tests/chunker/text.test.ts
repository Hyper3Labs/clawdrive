import { describe, it, expect } from "vitest";
import { chunkText } from "../../src/chunker/text.js";

describe("chunkText", () => {
  it("returns single chunk for small text", () => {
    const chunks = chunkText("Hello world", { maxTokens: 8192, minTokens: 512 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Hello world");
    expect(chunks[0].label).toBe("full");
  });

  it("splits by headings", () => {
    const text =
      "# Intro\nSome text here that is long enough\n\n## Methods\nMore text here that is also long enough\n\n## Results\nFinal text here that is long enough too";
    const chunks = chunkText(text, { maxTokens: 20, minTokens: 5 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("merges small sections", () => {
    const text = "# A\nTiny\n\n# B\nAlso tiny";
    const chunks = chunkText(text, { maxTokens: 8192, minTokens: 512 });
    expect(chunks).toHaveLength(1);
  });

  it("prepends contextual prefix when fileName provided", () => {
    // Create text large enough to be split
    const sections = Array.from(
      { length: 5 },
      (_, i) => `## Section ${i}\n${"word ".repeat(300)}`,
    ).join("\n\n");
    const chunks = chunkText(sections, {
      maxTokens: 100,
      minTokens: 10,
      fileName: "paper.md",
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text).toContain("[File: paper.md");
  });

  it("assigns sequential indices", () => {
    const sections = Array.from(
      { length: 3 },
      (_, i) => `## Section ${i}\n${"word ".repeat(300)}`,
    ).join("\n\n");
    const chunks = chunkText(sections, { maxTokens: 100, minTokens: 10 });
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
    }
  });

  it("splits large sections by paragraph boundaries", () => {
    // One big section with multiple paragraphs, each paragraph big enough
    const paragraphs = Array.from(
      { length: 5 },
      (_, i) => `Paragraph ${i}: ${"lorem ipsum dolor sit amet ".repeat(50)}`,
    ).join("\n\n");
    const text = `## Big Section\n${paragraphs}`;
    const chunks = chunkText(text, { maxTokens: 100, minTokens: 10 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("handles text without any headings", () => {
    const text = "word ".repeat(500);
    const chunks = chunkText(text, { maxTokens: 100, minTokens: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should have text content
    for (const chunk of chunks) {
      expect(chunk.text).toBeTruthy();
    }
  });

  it("uses default maxTokens and minTokens", () => {
    const chunks = chunkText("Small text");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].label).toBe("full");
  });

  it("includes heading in label when splitting by headings", () => {
    const text =
      "## Introduction\n" +
      "word ".repeat(300) +
      "\n\n## Methodology\n" +
      "word ".repeat(300);
    const chunks = chunkText(text, { maxTokens: 100, minTokens: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    // At least one chunk should reference a heading
    const hasHeadingLabel = chunks.some(
      (c) => c.label.includes("Introduction") || c.label.includes("Methodology"),
    );
    expect(hasHeadingLabel).toBe(true);
  });
});
