import { useEffect, useState } from "react";
import { getFile, getFileTags, updateFile } from "../../api";
import type { FileInfo } from "../../types";
import { MAP_THEME } from "../../theme";
import { TagEditor } from "../shared/TagEditor";
import { InlineEdit } from "../shared/InlineEdit";
import { DigestModal } from "../shared/DigestModal";
import { useToast } from "../shared/Toast";
import { Download } from "lucide-react";

function downloadFile(fileId: string, fileName: string) {
  const a = document.createElement("a");
  a.href = `/api/files/${encodeURIComponent(fileId)}/content`;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

interface FilePreviewProps {
  fileId: string;
  onClose: () => void;
}

export function FilePreview({ fileId, onClose }: FilePreviewProps) {
  const [file, setFile] = useState<FileInfo | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<string[]>([]);
  const [showDigestModal, setShowDigestModal] = useState(false);
  const { show } = useToast();

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
    getFileTags(fileId).then((res) => setTags(res.tags ?? [])).catch(() => {});
  }, [fileId]);

  async function handleTagChange(newTags: string[]) {
    try {
      await updateFile(fileId, { tags: newTags });
      setTags(newTags);
      show("Tags updated", { type: "success" });
    } catch { show("Failed to update tags", { type: "error" }); }
  }

  async function handleTldrSave(value: string) {
    try {
      await updateFile(fileId, { tldr: value || null });
      setFile((prev) => prev ? { ...prev, tldr: value || null } : prev);
      show("Saved", { type: "success" });
    } catch { show("Failed to save", { type: "error" }); }
  }

  async function handleDigestSave(value: string) {
    try {
      await updateFile(fileId, { digest: value || null });
      setFile((prev) => prev ? { ...prev, digest: value || null } : prev);
      show("Digest saved", { type: "success" });
    } catch { show("Failed to save digest", { type: "error" }); }
  }

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
  const isVideo = file.content_type?.startsWith("video/");
  const isAudio = file.content_type?.startsWith("audio/");
  const isText = file.content_type?.startsWith("text/") || file.content_type === "application/json" || file.content_type === "application/yaml";
  const isPdf = file.content_type === "application/pdf";

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: "bold", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {file.name}
        </span>
        <button
          onClick={() => downloadFile(fileId, file.name)}
          style={closeStyle}
          title="Download"
        >
          <Download size={14} />
        </button>
        <button onClick={onClose} style={closeStyle}>x</button>
      </div>

      {/* Metadata */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${MAP_THEME.borderSubtle}`, fontSize: 12 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", opacity: 0.6 }}>
          <span>{file.content_type}</span>
          <span>{formatSize(file.file_size)}</span>
          <span>{new Date(file.created_at).toLocaleDateString()}</span>
        </div>
        {file.source_url && (
          <div style={{ marginTop: 8 }}>
            <a
              href={file.source_url}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, color: MAP_THEME.accentPrimary, textDecoration: "none" }}
            >
              Open source
            </a>
          </div>
        )}
      </div>

      {/* Tags */}
      <div style={{ padding: "8px 16px", borderBottom: `1px solid ${MAP_THEME.borderSubtle}` }}>
        <TagEditor tags={tags} onChange={handleTagChange} />
      </div>

      {/* Summary */}
      <div style={{ padding: "8px 16px", borderBottom: `1px solid ${MAP_THEME.borderSubtle}` }}>
        <div style={{ fontSize: 11, opacity: 0.4, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Summary</div>
        <InlineEdit
          value={file.tldr ?? ""}
          placeholder="Add a summary..."
          onSave={handleTldrSave}
        />
      </div>

      {/* Digest button */}
      <div style={{ padding: "8px 16px", borderBottom: `1px solid ${MAP_THEME.borderSubtle}` }}>
        <button
          onClick={() => setShowDigestModal(true)}
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 4,
            color: MAP_THEME.textMuted,
            fontSize: 11,
            padding: "4px 10px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {file.digest ? "Edit digest" : "Add digest"}
        </button>
      </div>

      {/* Content preview */}
      <div style={{ flex: 1, overflow: "auto", padding: isPdf ? 0 : 16, display: "flex", flexDirection: "column" }}>
        {file.digest && (
          <div style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
          }}>
            <div style={{
              marginBottom: 8,
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.55,
            }}>
              Digest
            </div>
            <pre style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "inherit",
              fontSize: 12,
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.85)",
            }}>
              {file.digest}
            </pre>
          </div>
        )}
        {isImage && (
          <img
            src={`/api/files/${fileId}/content`}
            alt={file.name}
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
        {isVideo && (
          <video
            src={`/api/files/${fileId}/content`}
            controls
            style={{ width: "100%", borderRadius: 6, background: "#000" }}
          />
        )}
        {isAudio && (
          <div style={{ paddingTop: 20 }}>
            <audio
              src={`/api/files/${fileId}/content`}
              controls
              style={{ width: "100%" }}
            />
          </div>
        )}
        {isPdf && (
          <iframe
            src={`/api/files/${fileId}/content`}
            style={{
              width: "100%", height: "100%", border: "none",
              borderRadius: 6, background: "#fff",
            }}
            title={file.name}
          />
        )}
        {!isImage && !isVideo && !isAudio && !isText && !isPdf && (
          <div style={{ textAlign: "center", opacity: 0.4, paddingTop: 40, fontSize: 13 }}>
            No preview available for this file type
          </div>
        )}
      </div>
      {showDigestModal && (
        <DigestModal
          value={file.digest ?? ""}
          onSave={handleDigestSave}
          onClose={() => setShowDigestModal(false)}
        />
      )}
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
  background: "rgba(255,255,255,0.1)", border: "none", color: MAP_THEME.text,
  width: 24, height: 24, borderRadius: 4, cursor: "pointer", fontSize: 13,
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
