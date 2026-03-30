import { useEffect, useMemo, useState } from "react";
import type { ProjectionPoint } from "../../types";
import {
  getModalityColor,
  getModalityLabel,
  getPreviewKind,
} from "../../theme";
import { PdfThumbnail } from "../files/PdfThumbnail";

type PreviewVariant = "card" | "panel";

interface MapPreviewSurfaceProps {
  point: ProjectionPoint;
  variant: PreviewVariant;
}

const textSnippetCache = new Map<string, string>();

function normalizeSnippet(text: string, maxChars: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function buildWaveform(seed: string, bars: number): number[] {
  let value = 0;
  for (const char of seed) value = (value * 31 + char.charCodeAt(0)) >>> 0;

  return Array.from({ length: bars }, () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return 22 + (value % 62);
  });
}

export function MapPreviewSurface({ point, variant }: MapPreviewSurfaceProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [textSnippet, setTextSnippet] = useState<string | null>(
    textSnippetCache.get(point.id) ?? null,
  );
  const kind = getPreviewKind(point.contentType);
  const color = getModalityColor(point.contentType);
  const label = getModalityLabel(point.contentType);
  const previewUrl = point.previewUrl || `/api/files/${point.id}/content`;
  const height = variant === "card" ? 84 : 118;
  const waveform = useMemo(
    () => buildWaveform(point.id, variant === "card" ? 18 : 28),
    [point.id, variant],
  );

  useEffect(() => {
    setImageFailed(false);
  }, [point.id]);

  useEffect(() => {
    if (kind !== "text") return;

    const cached = textSnippetCache.get(point.id);
    if (cached) {
      setTextSnippet(cached);
      return;
    }

    let cancelled = false;

    fetch(previewUrl)
      .then((response) => response.text())
      .then((text) => {
        if (cancelled) return;
        const snippet = normalizeSnippet(text, variant === "card" ? 180 : 420);
        textSnippetCache.set(point.id, snippet);
        setTextSnippet(snippet);
      })
      .catch(() => {
        if (!cancelled) setTextSnippet("");
      });

    return () => {
      cancelled = true;
    };
  }, [kind, point.id, previewUrl, variant]);

  if (kind === "image" && !imageFailed) {
    return (
      <img
        src={previewUrl}
        alt={point.fileName}
        loading="lazy"
        onError={() => setImageFailed(true)}
        className="block w-full object-cover bg-[rgba(8,18,26,0.85)]"
        style={{ height }}
      />
    );
  }

  if (kind === "pdf") {
    return (
      <div className="overflow-hidden bg-[#f3f7fb]" style={{ height }}>
        <PdfThumbnail
          url={previewUrl}
          desiredWidth={variant === "card" ? 160 : 320}
        />
      </div>
    );
  }

  if (kind === "video") {
    return (
      <video
        src={previewUrl}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          if (video.duration && Number.isFinite(video.duration)) {
            video.currentTime = Math.min(0.15, video.duration / 4);
          }
        }}
        className="block w-full object-cover bg-[#04090d]"
        style={{ height }}
      />
    );
  }

  if (kind === "audio") {
    return (
      <div
        className="flex items-center justify-center bg-[linear-gradient(135deg,rgba(18,28,36,0.96),rgba(9,16,24,0.94))]"
        style={{
          height,
          gap: variant === "card" ? 2 : 3,
          padding: variant === "card" ? "0 10px" : "0 16px",
        }}
      >
        {waveform.map((bar, index) => (
          <span
            key={`${point.id}-${index}`}
            className="rounded-full"
            style={{
              width: variant === "card" ? 4 : 5,
              height: `${bar}%`,
              background: `${color}${variant === "card" ? "cc" : "dd"}`,
              opacity: 0.5 + ((index % 5) * 0.08),
            }}
          />
        ))}
      </div>
    );
  }

  if (kind === "text" && textSnippet) {
    return (
      <div
        className="overflow-hidden break-words bg-[linear-gradient(135deg,rgba(13,24,35,0.96),rgba(7,15,23,0.94))] font-mono text-[rgba(230,240,247,0.78)]"
        style={{
          height,
          padding: variant === "card" ? "10px 10px 8px" : "12px 14px",
          fontSize: variant === "card" ? 9 : 11,
          lineHeight: variant === "card" ? 1.45 : 1.55,
        }}
      >
        {textSnippet}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center gap-1.5 bg-[linear-gradient(135deg,rgba(13,24,35,0.96),rgba(7,15,23,0.94))]"
      style={{
        height,
        color,
      }}
    >
      <div className="font-bold tracking-[1px]" style={{ fontSize: variant === "card" ? 16 : 18 }}>
        {label}
      </div>
      <div className="text-[var(--text)] opacity-60 tracking-[0.8px]" style={{ fontSize: variant === "card" ? 9 : 10 }}>
        Preview unavailable
      </div>
    </div>
  );
}