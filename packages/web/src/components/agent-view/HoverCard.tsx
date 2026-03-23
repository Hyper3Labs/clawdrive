import { useEffect, useState } from "react";
import type { ProjectionPoint } from "../../types";
import { getModalityColor, getModalityLabel, getPreviewKind, MAP_THEME } from "../../theme";

export function HoverCard({ point }: { point: ProjectionPoint }) {
  const [imageFailed, setImageFailed] = useState(false);
  const color = getModalityColor(point.contentType);
  const label = getModalityLabel(point.contentType);
  const previewKind = getPreviewKind(point.contentType);

  useEffect(() => {
    setImageFailed(false);
  }, [point.id]);

  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        right: 20,
        background: "linear-gradient(135deg, rgba(8, 22, 32, 0.92), rgba(6, 16, 24, 0.92))",
        border: `1px solid ${MAP_THEME.border}`,
        borderRadius: 12,
        padding: "14px 14px 12px",
        fontSize: 13,
        width: 260,
        backdropFilter: "blur(8px)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            padding: "3px 8px",
            borderRadius: 999,
            border: `1px solid ${color}66`,
            color,
            letterSpacing: 0.6,
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {label}
        </span>
      </div>

      <div
        style={{
          fontWeight: 600,
          color: MAP_THEME.text,
          marginBottom: 6,
          fontFamily: "'DM Sans', 'Avenir Next', 'Segoe UI', sans-serif",
          fontSize: 14,
          lineHeight: 1.3,
          wordBreak: "break-word",
        }}
      >
        {point.fileName}
      </div>

      <div
        style={{
          opacity: 0.6,
          fontSize: 11,
          marginBottom: 10,
          color: MAP_THEME.text,
        }}
      >
        {point.contentType}
      </div>

      <div
        style={{
          border: `1px solid ${MAP_THEME.border}`,
          borderRadius: 10,
          overflow: "hidden",
          minHeight: 118,
          background: "rgba(10, 19, 28, 0.7)",
          marginBottom: 10,
        }}
      >
        {previewKind === "image" && point.previewUrl && !imageFailed ? (
          <img
            src={point.previewUrl}
            alt={point.fileName}
            loading="lazy"
            onError={() => setImageFailed(true)}
            style={{ width: "100%", height: 118, objectFit: "cover", display: "block" }}
          />
        ) : (
          <div
            style={{
              height: 118,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            {label} PREVIEW
          </div>
        )}
      </div>

      {point.tags.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
          }}
        >
          {point.tags.map((t) => (
            <span
              key={t}
              style={{
                padding: "2px 6px",
                borderRadius: 3,
                fontSize: 10,
                background: `${color}20`,
                color,
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
