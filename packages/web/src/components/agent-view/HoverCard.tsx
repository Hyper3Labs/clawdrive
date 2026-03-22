import type { ProjectionPoint } from "../../types";

const TYPE_COLORS: Record<string, string> = {
  "application/pdf": "#7dd3fc",
  "image/": "#86efac",
  "video/": "#c084fc",
  "audio/": "#fbbf24",
  "text/": "#f87171",
};

function getColor(ct: string): string {
  for (const [prefix, hex] of Object.entries(TYPE_COLORS)) {
    if (ct.startsWith(prefix)) return hex;
  }
  return "#e4e4e7";
}

export function HoverCard({ point }: { point: ProjectionPoint }) {
  const color = getColor(point.contentType);
  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        right: 20,
        background:
          "linear-gradient(135deg, rgba(45,27,78,0.95), rgba(26,10,46,0.95))",
        border: `1px solid ${color}50`,
        borderRadius: 10,
        padding: "14px 18px",
        fontSize: 13,
        minWidth: 220,
        backdropFilter: "blur(8px)",
        boxShadow: `0 10px 30px rgba(0,0,0,0.5), 0 0 15px ${color}20`,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontWeight: "bold",
          color,
          marginBottom: 6,
          fontFamily: "'SF Mono', monospace",
          fontSize: 14,
        }}
      >
        {point.fileName}
      </div>
      <div style={{ opacity: 0.5, fontSize: 11, marginBottom: 2 }}>
        {point.contentType}
      </div>
      {point.tags.length > 0 && (
        <div
          style={{
            marginTop: 6,
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
                color: `${color}`,
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
