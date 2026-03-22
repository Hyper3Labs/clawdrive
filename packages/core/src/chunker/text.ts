import type { Chunk, ChunkOptions } from "./types.js";

/** Rough token estimate: ~4 characters per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface Section {
  heading: string | null;
  content: string;
}

/**
 * Split content into sections by markdown headings.
 * Returns an array of { heading, content } pairs.
 */
function splitByHeadings(content: string): Section[] {
  // Match lines that start with one or more # followed by a space
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const sections: Section[] = [];
  let lastIndex = 0;
  let lastHeading: string | null = null;

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(content)) !== null) {
    // Capture content before this heading
    const before = content.slice(lastIndex, match.index).trim();
    if (before || lastHeading !== null) {
      sections.push({ heading: lastHeading, content: before });
    }

    lastHeading = match[2].trim();
    lastIndex = match.index + match[0].length;
  }

  // Capture remaining content after the last heading
  const remaining = content.slice(lastIndex).trim();
  if (remaining || lastHeading !== null) {
    sections.push({ heading: lastHeading, content: remaining });
  }

  // If no headings were found, return the whole content as one section
  if (sections.length === 0) {
    sections.push({ heading: null, content: content.trim() });
  }

  return sections;
}

/**
 * Split a text block by paragraph boundaries (\n\n).
 */
function splitByParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Merge adjacent sections that are below minTokens.
 */
function mergeSections(sections: Section[], minTokens: number): Section[] {
  if (sections.length <= 1) return sections;

  const merged: Section[] = [];
  let current = { ...sections[0] };

  for (let i = 1; i < sections.length; i++) {
    const currentTokens = estimateTokens(current.content);
    const nextTokens = estimateTokens(sections[i].content);

    if (currentTokens < minTokens || nextTokens < minTokens) {
      // Merge: combine content, keep first heading (or use second if first is null)
      const combinedContent = [current.content, sections[i].content]
        .filter(Boolean)
        .join("\n\n");
      const heading = current.heading ?? sections[i].heading;
      current = { heading, content: combinedContent };
    } else {
      merged.push(current);
      current = { ...sections[i] };
    }
  }
  merged.push(current);

  return merged;
}

/**
 * Split text into chunks of approximately maxTokens by token boundary.
 * Uses whitespace boundaries to avoid splitting words.
 */
function splitByTokenBoundary(text: string, maxTokens: number): string[] {
  const maxChars = maxTokens * 4;
  const result: string[] = [];
  let start = 0;

  while (start < text.length) {
    if (start + maxChars >= text.length) {
      result.push(text.slice(start).trim());
      break;
    }

    // Find a whitespace boundary near maxChars
    let end = start + maxChars;
    // Search backwards for a space
    while (end > start && text[end] !== " " && text[end] !== "\n") {
      end--;
    }
    // If no space found, just cut at maxChars
    if (end === start) {
      end = start + maxChars;
    }

    result.push(text.slice(start, end).trim());
    start = end;
  }

  return result.filter((s) => s.length > 0);
}

/**
 * Split a section that exceeds maxTokens into smaller chunks by paragraphs.
 * Falls back to token-boundary splitting if there are no paragraph breaks.
 */
function splitLargeSection(
  section: Section,
  maxTokens: number,
): Section[] {
  const paragraphs = splitByParagraphs(section.content);
  if (paragraphs.length <= 1) {
    // No paragraph breaks — split by token boundary
    const parts = splitByTokenBoundary(section.content, maxTokens);
    if (parts.length <= 1) return [section];
    return parts.map((part, i) => ({
      heading: section.heading
        ? `${section.heading} (part ${i + 1})`
        : null,
      content: part,
    }));
  }

  const result: Section[] = [];
  let currentContent = "";
  let partIndex = 0;

  for (const paragraph of paragraphs) {
    const combined = currentContent
      ? currentContent + "\n\n" + paragraph
      : paragraph;

    if (estimateTokens(combined) > maxTokens && currentContent) {
      partIndex++;
      const heading = section.heading
        ? `${section.heading} (part ${partIndex})`
        : null;
      result.push({ heading, content: currentContent });
      currentContent = paragraph;
    } else {
      currentContent = combined;
    }
  }

  if (currentContent) {
    partIndex++;
    const heading =
      partIndex > 1 && section.heading
        ? `${section.heading} (part ${partIndex})`
        : section.heading;
    result.push({ heading, content: currentContent });
  }

  return result;
}

/**
 * Structure-preserving text chunker.
 *
 * 1. If content is under maxTokens, returns a single chunk labeled "full".
 * 2. Splits by markdown headings.
 * 3. Merges adjacent sections below minTokens.
 * 4. Splits sections above maxTokens by paragraph boundaries.
 * 5. Optionally prepends a contextual prefix with fileName.
 */
export function chunkText(
  content: string,
  opts: ChunkOptions = {},
): Chunk[] {
  const maxTokens = opts.maxTokens ?? 8192;
  const minTokens = opts.minTokens ?? 512;

  // If entire content fits in one chunk, return it directly
  if (estimateTokens(content) <= maxTokens) {
    return [{ index: 0, label: "full", text: content }];
  }

  // Step 1: Split by headings
  let sections = splitByHeadings(content);

  // Step 2: Merge small sections
  sections = mergeSections(sections, minTokens);

  // Step 3: Split large sections by paragraphs
  const finalSections: Section[] = [];
  for (const section of sections) {
    if (estimateTokens(section.content) > maxTokens) {
      finalSections.push(...splitLargeSection(section, maxTokens));
    } else {
      finalSections.push(section);
    }
  }

  // If after all processing we have a single section, return as full
  if (finalSections.length === 1) {
    return [{ index: 0, label: "full", text: finalSections[0].content }];
  }

  // Step 4: Build chunks with labels and optional prefix
  const totalChunks = finalSections.length;
  return finalSections.map((section, i) => {
    const label = section.heading
      ? `Section: ${section.heading}`
      : `${i + 1} of ${totalChunks}`;

    let text = section.content;
    if (opts.fileName) {
      const prefix = `[File: ${opts.fileName} | ${label} | ${i + 1} of ${totalChunks}]`;
      text = `${prefix}\n${text}`;
    }

    return { index: i, label, text };
  });
}
