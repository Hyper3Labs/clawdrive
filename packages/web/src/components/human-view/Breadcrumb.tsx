interface BreadcrumbProps {
  path: string[];
  onNavigate: (path: string[]) => void;
}

export function Breadcrumb({ path, onNavigate }: BreadcrumbProps) {
  const segments = ["All", ...path];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <span style={{ opacity: 0.3, fontSize: 11 }}>{"\u203A"}</span>}
            <span
              onClick={() => {
                if (!isLast) {
                  // Navigate to this level: take path segments up to index i
                  // i=0 means "All" (root), path = []
                  onNavigate(path.slice(0, i));
                }
              }}
              style={{
                cursor: isLast ? "default" : "pointer",
                color: isLast ? "#e4e4e7" : "rgba(255,255,255,0.5)",
                fontWeight: isLast ? 600 : 400,
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isLast) e.currentTarget.style.color = "#e4e4e7";
              }}
              onMouseLeave={(e) => {
                if (!isLast) e.currentTarget.style.color = "rgba(255,255,255,0.5)";
              }}
            >
              {seg}
            </span>
          </span>
        );
      })}
    </div>
  );
}
