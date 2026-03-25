import { useEffect, useState, useRef } from "react";
import type { ProjectionPoint } from "../../types";
import { getModalityColor, getModalityLabel, getPreviewKind, MAP_THEME, Z_INDEX } from "../../theme";
import { fileContentUrl } from "../../api";
import { useVisualizationStore } from "./useVisualizationStore";

function TextPreview({ point }: { point: ProjectionPoint }) {
  const [text, setText] = useState<string | null>(null);
  const contentUrl = fileContentUrl(point.id);

  useEffect(() => {
    let cancelled = false;
    fetch(contentUrl, { headers: { Range: "bytes=0-6000" } })
      .then((res) => res.text())
      .then((t) => { if (!cancelled) setText(t); })
      .catch(() => { if (!cancelled) setText(null); });
    return () => { cancelled = true; };
  }, [contentUrl]);

  if (text === null) {
    return (
      <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: MAP_THEME.textMuted, fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  return (
    <pre style={{
      margin: 0, padding: 14, fontSize: 11, lineHeight: 1.5,
      color: MAP_THEME.text, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      whiteSpace: "pre-wrap", wordBreak: "break-word",
      maxHeight: 280, overflowY: "auto", background: "transparent",
    }}>
      {text.slice(0, 3000)}
    </pre>
  );
}

function MediaPreview({ point }: { point: ProjectionPoint }) {
  const kind = getPreviewKind(point.contentType);
  const color = getModalityColor(point.contentType);
  const label = getModalityLabel(point.contentType);
  const contentUrl = fileContentUrl(point.id);

  if (kind === "image") {
    return (
      <img
        src={contentUrl}
        alt={point.fileName}
        loading="lazy"
        style={{ width: "100%", height: 280, objectFit: "contain", display: "block", background: "#0a131c" }}
      />
    );
  }

  if (kind === "video") {
    return (
      <video
        key={point.id}
        src={contentUrl}
        controls
        autoPlay
        muted
        style={{ width: "100%", height: 280, objectFit: "contain", display: "block", background: "#000" }}
      />
    );
  }

  if (kind === "audio") {
    return (
      <div style={{ padding: 20, display: "flex", alignItems: "center" }}>
        <audio key={point.id} src={contentUrl} controls style={{ width: "100%" }} />
      </div>
    );
  }

  if (kind === "pdf") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <object
          key={point.id}
          data={`${contentUrl}#toolbar=0&navpanes=0&scrollbar=0`}
          type="application/pdf"
          style={{ width: "100%", height: 360, borderRadius: 4, background: "#fff" }}
        >
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: MAP_THEME.textMuted }}>
            PDF preview unavailable
          </div>
        </object>
        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8 }}>
          <a
            href={contentUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: MAP_THEME.accentPrimary, fontSize: 11, textDecoration: "none",
              padding: "4px 10px", borderRadius: 4,
              border: `1px solid rgba(110, 231, 255, 0.2)`,
              background: "rgba(110, 231, 255, 0.05)",
            }}
          >
            Open in new tab ↗
          </a>
        </div>
      </div>
    );
  }

  if (kind === "text") {
    return <TextPreview point={point} />;
  }

  // Unknown type — show a lightweight placeholder instead of issuing another fetch.
  return (
    <div
      style={{
        height: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color,
        fontSize: 13,
        letterSpacing: 0.6,
        textTransform: "uppercase",
      }}
    >
      {label} preview unavailable
    </div>
  );
}

function PotAssignment({ point }: { point: ProjectionPoint }) {
  const pots = useVisualizationStore((s) => s.pots);
  const assignFileToPot = useVisualizationStore((s) => s.assignFileToPot);
  const unassignFileFromPot = useVisualizationStore((s) => s.unassignFileFromPot);
  const [showPicker, setShowPicker] = useState(false);
  const [localTags, setLocalTags] = useState<string[]>(point.tags);

  // Reset local tags when a different file is displayed
  useEffect(() => { setLocalTags(point.tags); }, [point.id, point.tags]);

  const assignedSlugs = localTags
    .filter((t) => t.startsWith("pot:"))
    .map((t) => t.slice(4));

  const assignedPots = pots.filter((p) => assignedSlugs.includes(p.slug));
  const unassignedPots = pots.filter((p) => !assignedSlugs.includes(p.slug));

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${MAP_THEME.border}` }}>
      <div style={{ color: MAP_THEME.textMuted, textTransform: "uppercase", fontSize: 10, letterSpacing: 1 }}>Pot</div>
      <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {assignedPots.map((p) => (
          <span
            key={p.id}
            onClick={async () => {
              await unassignFileFromPot(point.id, p.slug, localTags);
              setLocalTags((prev) => prev.filter((t) => t !== `pot:${p.slug}`));
            }}
            style={{
              background: "rgba(110, 231, 255, 0.08)",
              border: "1px solid rgba(110, 231, 255, 0.25)",
              color: MAP_THEME.accentPrimary,
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {p.name} ×
          </span>
        ))}
        {unassignedPots.length > 0 && (
          <div style={{ position: "relative" }}>
            <div
              onClick={() => setShowPicker(!showPicker)}
              style={{
                width: 22, height: 22, borderRadius: 6,
                background: "rgba(110, 231, 255, 0.08)",
                border: "1px solid rgba(110, 231, 255, 0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: MAP_THEME.accentPrimary, fontSize: 14, cursor: "pointer",
              }}
            >
              +
            </div>
            {showPicker && (
              <div style={{
                position: "absolute",
                bottom: "100%",
                left: 0,
                marginBottom: 4,
                background: MAP_THEME.panel,
                border: `1px solid ${MAP_THEME.border}`,
                borderRadius: 8,
                padding: 4,
                minWidth: 140,
                zIndex: 10,
              }}>
                {unassignedPots.map((p) => (
                  <div
                    key={p.id}
                    onClick={async () => {
                      await assignFileToPot(point.id, p.slug, localTags);
                      setLocalTags((prev) => [...prev, `pot:${p.slug}`]);
                      setShowPicker(false);
                    }}
                    style={{
                      padding: "6px 10px",
                      fontSize: 12,
                      color: MAP_THEME.text,
                      cursor: "pointer",
                      borderRadius: 4,
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "rgba(110, 231, 255, 0.08)"; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
                  >
                    {p.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ExpandablePreview({ points }: { points: ProjectionPoint[] }) {
  const clickedFileId = useVisualizationStore((s) => s.clickedFileId);
  const clickFile = useVisualizationStore((s) => s.clickFile);

  const [displayedId, setDisplayedId] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(1);
  const prevClickedId = useRef<string | null>(null);

  useEffect(() => {
    if (clickedFileId === null) {
      // Closing modal — instant
      setDisplayedId(null);
      setOpacity(1);
      prevClickedId.current = null;
      return;
    }

    if (prevClickedId.current === null) {
      // Fresh open — instant
      setDisplayedId(clickedFileId);
      setOpacity(1);
      prevClickedId.current = clickedFileId;
      return;
    }

    if (prevClickedId.current !== clickedFileId) {
      // Switching files — crossfade
      setOpacity(0);
      const timer = setTimeout(() => {
        setDisplayedId(clickedFileId);
        setOpacity(1);
        prevClickedId.current = clickedFileId;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [clickedFileId]);

  const dismiss = () => { clickFile(null); };

  const point = points.find((p) => p.id === displayedId);

  if (!clickedFileId) return null;

  const color = point ? getModalityColor(point.contentType) : MAP_THEME.textMuted;

  // Expanded preview — centered modal with backdrop
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: Z_INDEX.modal,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(3, 10, 15, 0.6)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, rgba(8, 22, 32, 0.97), rgba(6, 16, 24, 0.97))",
          border: `1px solid ${MAP_THEME.border}`,
          borderRadius: 14,
          padding: 20,
          fontSize: 13,
          width: 560,
          maxHeight: "80vh",
          overflowY: "auto",
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          opacity,
          transition: "opacity 100ms ease",
        }}
      >
        {point && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: MAP_THEME.text, fontSize: 15, fontWeight: 600, wordBreak: "break-word", flex: 1 }}>
                {point.fileName}
              </div>
              <div
                onClick={() => dismiss()}
                style={{ color: MAP_THEME.textMuted, fontSize: 20, cursor: "pointer", marginLeft: 8, lineHeight: 1 }}
              >
                ×
              </div>
            </div>

            <div style={{
              border: `1px solid ${MAP_THEME.border}`, borderRadius: 10,
              overflow: "hidden", marginTop: 14, background: "rgba(10, 19, 28, 0.7)",
            }}>
              <MediaPreview point={point} />
            </div>

            <div style={{
              marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: 8, fontSize: 12,
            }}>
              <div>
                <div style={{ color: MAP_THEME.textMuted, textTransform: "uppercase", fontSize: 10, letterSpacing: 1 }}>Type</div>
                <div style={{ color: MAP_THEME.text, marginTop: 2 }}>{point.contentType}</div>
              </div>
              <div>
                <div style={{ color: MAP_THEME.textMuted, textTransform: "uppercase", fontSize: 10, letterSpacing: 1 }}>ID</div>
                <div style={{ color: MAP_THEME.text, marginTop: 2, fontSize: 10, opacity: 0.7 }}>{point.id.slice(0, 12)}...</div>
              </div>
            </div>

            {point.tags.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ color: MAP_THEME.textMuted, textTransform: "uppercase", fontSize: 10, letterSpacing: 1 }}>Tags</div>
                <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {point.tags.filter((t) => !t.startsWith("pot:")).map((t) => (
                    <span key={t} style={{
                      padding: "2px 8px", borderRadius: 999, fontSize: 10,
                      background: `${color}20`, color,
                    }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <PotAssignment point={point} />
          </>
        )}
      </div>
    </div>
  );
}
