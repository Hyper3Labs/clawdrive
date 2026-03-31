import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { FileText } from "lucide-react";

// Point to the worker bundled with pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

// Module-level cache — survives re-renders and re-mounts
const thumbnailCache = new Map<string, string>();

interface PdfThumbnailProps {
  url: string;
  desiredWidth?: number;
}

export function PdfThumbnail({ url, desiredWidth = 300 }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  const [cached, setCached] = useState<string | null>(thumbnailCache.get(url) ?? null);

  useEffect(() => {
    // If already cached, no need to render
    if (thumbnailCache.has(url)) {
      setCached(thumbnailCache.get(url)!);
      return;
    }

    let cancelled = false;
    let pdfDocument: { destroy(): Promise<void> } | null = null;
    let renderTask: { cancel(): void; promise: Promise<unknown> } | null = null;

    async function render() {
      try {
        setError(false);
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        pdfDocument = pdf;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = desiredWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        renderTask = page.render({ canvas, canvasContext: ctx, viewport });
        await renderTask.promise;

        // Cache the rendered thumbnail as a data URL
        if (!cancelled) {
          try {
            const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
            thumbnailCache.set(url, dataUrl);
            setCached(dataUrl);
          } catch {
            // toDataURL can fail on tainted canvases — ignore
          }
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      void pdfDocument?.destroy();
    };
  }, [desiredWidth, url]);

  if (error) {
    return (
      <div className="flex h-20 items-center justify-center bg-black/20">
        <div className="opacity-30"><FileText size={36} /></div>
      </div>
    );
  }

  // Show cached image instantly — no white flash
  if (cached) {
    return (
      <img
        src={cached}
        alt=""
        className="block w-full rounded-t-[8px]"
      />
    );
  }

  // First render — show dark placeholder while canvas renders behind the scenes
  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="block w-full rounded-t-[8px] bg-[var(--bg-panel)]"
      />
    </div>
  );
}
