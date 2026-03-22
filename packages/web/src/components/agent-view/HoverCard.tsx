import type { ProjectionPoint } from "../../types";

function getTypeColor(contentType: string): string {
  if (contentType.startsWith("application/pdf")) return "#7dd3fc";
  if (contentType.startsWith("image/")) return "#86efac";
  if (contentType.startsWith("video/")) return "#c084fc";
  if (contentType.startsWith("audio/")) return "#fbbf24";
  if (contentType.startsWith("text/")) return "#f87171";
  return "#e4e4e7";
}

export function HoverCard({ point }: { point: ProjectionPoint }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        background: "rgba(0,0,0,0.85)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 8,
        padding: "12px 16px",
        fontSize: 13,
        minWidth: 200,
        backdropFilter: "blur(8px)",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontWeight: "bold",
          color: getTypeColor(point.contentType),
          marginBottom: 4,
        }}
      >
        {point.fileName}
      </div>
      <div style={{ opacity: 0.5, fontSize: 11 }}>
        Type: {point.contentType}
      </div>
      {point.tags.length > 0 && (
        <div style={{ opacity: 0.5, fontSize: 11, marginTop: 2 }}>
          Tags: {point.tags.join(", ")}
        </div>
      )}
    </div>
  );
}
