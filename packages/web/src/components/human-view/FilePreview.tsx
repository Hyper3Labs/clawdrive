import { useEffect, useState } from "react";
import { getFile } from "../../api";

interface FilePreviewProps {
  fileId: string;
  onClose: () => void;
}

export function FilePreview({ fileId, onClose }: FilePreviewProps) {
  const [file, setFile] = useState<any>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setTextContent(null);
    getFile(fileId)
      .then((f) => {
        setFile(f);
        // For text files, fetch content
        if (f.content_type?.startsWith("text/") || f.content_type === "application/json") {
          fetch(`/api/files/${fileId}/content`)
            .then((r) => r.text())
            .then(setTextContent)
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fileId]);

  if (loading) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={{ opacity: 0.4 }}>Loading...</span>
          <button onClick={onClose} style={closeStyle}>x</button>
        </div>
      </div>
    );
  }

  if (!file) return null;

  const isImage = file.content_type?.startsWith("image/");
  const isText = file.content_type?.startsWith("text/") || file.content_type === "application/json";
  const isPdf = file.content_type === "application/pdf";

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: "bold", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {file.original_name}
        </span>
        <button onClick={onClose} style={closeStyle}>x</button>
      </div>

      {/* Metadata */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)", fontSize: 12 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", opacity: 0.6 }}>
          <span>{file.content_type}</span>
          <span>{formatSize(file.file_size)}</span>
          <span>{new Date(file.created_at).toLocaleDateString()}</span>
        </div>
        {file.description && (
          <div style={{ marginTop: 8, opacity: 0.7 }}>{file.description}</div>
        )}
        {file.tags?.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
            {file.tags.map((t: string) => (
              <span key={t} style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 11,
                background: "rgba(99,102,241,0.15)", color: "#a5b4fc",
              }}>{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Content preview */}
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {isImage && (
          <img
            src={`/api/files/${fileId}/content`}
            alt={file.original_name}
            style={{ maxWidth: "100%", borderRadius: 6 }}
          />
        )}
        {isText && textContent !== null && (
          <pre style={{
            fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 12,
            lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
            color: "rgba(255,255,255,0.8)", margin: 0,
          }}>
            {textContent}
          </pre>
        )}
        {isPdf && (
          <div style={{ textAlign: "center", opacity: 0.4, paddingTop: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>PDF</div>
            <div style={{ fontSize: 13 }}>PDF preview not available</div>
            <a
              href={`/api/files/${fileId}/content`}
              target="_blank"
              rel="noopener"
              style={{ color: "#7dd3fc", fontSize: 13, marginTop: 8, display: "inline-block" }}
            >
              Open in new tab
            </a>
          </div>
        )}
        {!isImage && !isText && !isPdf && (
          <div style={{ textAlign: "center", opacity: 0.4, paddingTop: 40, fontSize: 13 }}>
            No preview available for this file type
          </div>
        )}
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: 380, flexShrink: 0,
  borderLeft: "1px solid rgba(255,255,255,0.1)",
  display: "flex", flexDirection: "column",
  background: "rgba(0,0,0,0.2)",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)",
  gap: 8,
};

const closeStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.1)", border: "none", color: "#e4e4e7",
  width: 24, height: 24, borderRadius: 4, cursor: "pointer", fontSize: 13,
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
