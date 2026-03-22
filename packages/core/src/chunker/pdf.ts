import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
import type { Chunk, ChunkOptions } from "./types.js";

/**
 * Split a PDF file into segments of `pdfPages` pages each.
 *
 * Uses `pdf-lib` to read the source PDF, copy page subsets into new
 * PDFDocuments, and serialize each segment to bytes.
 *
 * If the PDF has fewer pages than `pdfPages`, returns a single chunk
 * with label "full".
 */
export async function chunkPdf(
  filePath: string,
  opts: ChunkOptions = {},
): Promise<Chunk[]> {
  const pdfPages = opts.pdfPages ?? 6;
  const pdfBytes = await readFile(filePath);
  const srcDoc = await PDFDocument.load(pdfBytes);
  const totalPages = srcDoc.getPageCount();

  if (totalPages <= pdfPages) {
    return [
      {
        index: 0,
        label: "full",
        data: Buffer.from(pdfBytes),
        mimeType: "application/pdf",
      },
    ];
  }

  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (let start = 0; start < totalPages; start += pdfPages) {
    const end = Math.min(start + pdfPages, totalPages);
    const newDoc = await PDFDocument.create();
    const pageIndices = Array.from({ length: end - start }, (_, i) => start + i);
    const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);

    for (const page of copiedPages) {
      newDoc.addPage(page);
    }

    const segmentBytes = await newDoc.save();
    const label = `pages ${start + 1}-${end}`;

    chunks.push({
      index: chunkIndex++,
      label,
      data: Buffer.from(segmentBytes),
      mimeType: "application/pdf",
    });
  }

  return chunks;
}
