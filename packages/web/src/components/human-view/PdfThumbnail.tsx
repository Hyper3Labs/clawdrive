import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Point to the worker bundled with pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

interface PdfThumbnailProps {
  url: string;
  desiredWidth?: number;
}

export function PdfThumbnail({ url, desiredWidth = 300 }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
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
      <div style={{
        height: 80, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.2)",
      }}>
        <span style={{ fontSize: 36, opacity: 0.3 }}>{"\uD83D\uDCC4"}</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", display: "block", background: "#fff", borderRadius: "8px 8px 0 0" }}
    />
  );
}
