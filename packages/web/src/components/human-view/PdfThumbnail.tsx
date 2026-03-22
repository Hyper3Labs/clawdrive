import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Point to the worker bundled with pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

interface PdfThumbnailProps {
  url: string;
}

export function PdfThumbnail({ url }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const pdf = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Scale to fit the card width (~250px)
        const desiredWidth = 300;
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = desiredWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch {
        if (!cancelled) setError(true);
      }
    }

    render();
    return () => { cancelled = true; };
  }, [url]);

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
