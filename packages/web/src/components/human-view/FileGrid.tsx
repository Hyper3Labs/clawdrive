import { useEffect, useState } from "react";
import { listFiles } from "../../api";
import type { FileInfo } from "../../types";

interface FileGridProps {
  selectedPath: string[];
  onFileClick?: (fileId: string) => void;
}

function contentTypeIcon(ct: string): string {
  if (ct.startsWith("application/pdf")) return "\uD83D\uDCC4";
  if (ct.startsWith("video/")) return "\uD83C\uDFAC";
  if (ct.startsWith("audio/")) return "\uD83D\uDD0A";
  return "\uD83D\uDCDD";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileCard({ file, onClick }: { file: FileInfo; onClick: () => void }) {
  const isImage = file.content_type.startsWith("image/");
  const isText = file.content_type.startsWith("text/") || file.content_type === "application/json";
  const [textSnippet, setTextSnippet] = useState<string | null>(null);

  useEffect(() => {
    if (isText) {
      fetch(`/api/files/${file.id}/content`)
        .then((r) => r.text())
        .then((t) => setTextSnippet(t.slice(0, 300)))
        .catch(() => {});
    }
  }, [file.id, isText]);

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 8,
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s, transform 0.15s",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        breakInside: "avoid",
        marginBottom: 12,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.06)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.03)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
      onClick={onClick}
    >
      {/* Preview area — natural height for images, variable for text */}
      {isImage ? (
        <img
          src={`/api/files/${file.id}/content`}
          alt={file.original_name}
          style={{ width: "100%", display: "block" }}
          loading="lazy"
        />
      ) : isText && textSnippet ? (
        <div style={{ background: "rgba(0,0,0,0.25)", padding: 12 }}>
          <pre style={{
            fontSize: 10, lineHeight: 1.5,
            color: "rgba(255,255,255,0.5)", margin: 0,
            overflow: "hidden",
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            maxHeight: 160,
          }}>
            {textSnippet}
          </pre>
        </div>
      ) : (
        <div style={{
          height: 80, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.2)",
        }}>
          <span style={{ fontSize: 36, opacity: 0.3 }}>{contentTypeIcon(file.content_type)}</span>
        </div>
      )}

      {/* File info */}
      <div style={{ padding: "10px 12px" }}>
        <div
          style={{
            fontSize: 12, color: "#e4e4e7",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
          title={file.original_name}
        >
          {file.original_name}
        </div>
        <div style={{ fontSize: 11, opacity: 0.35, marginTop: 4 }}>{formatSize(file.file_size)}</div>
      </div>
    </div>
  );
}

export function FileGrid({ selectedPath, onFileClick }: FileGridProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    async function fetchAll() {
      const allFiles: FileInfo[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 20; i++) {
        const res: { items?: FileInfo[]; nextCursor?: string } = await listFiles({ limit: 100, cursor });
        const items = res.items ?? [];
        allFiles.push(...items);
        if (!res.nextCursor || items.length === 0) break;
        cursor = res.nextCursor;
      }
      return allFiles;
    }
    fetchAll()
      .then((allFiles) => {
        if (selectedPath.length > 1) {
          const filtered = allFiles.filter((f: any) => {
            const tp: string[] = f.taxonomy_path ?? [];
            return selectedPath.every((seg) => tp.includes(seg));
          });
          setFiles(filtered.length > 0 ? filtered : allFiles);
        } else {
          setFiles(allFiles);
        }
      })
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [selectedPath]);

  if (loading) {
    return <div style={{ padding: 24, opacity: 0.4, fontSize: 13, textAlign: "center" }}>Loading files...</div>;
  }

  if (files.length === 0) {
    return <div style={{ padding: 24, opacity: 0.4, fontSize: 13, textAlign: "center" }}>No files found</div>;
  }

  return (
    <div style={{
      columnCount: 4,
      columnGap: 12,
      padding: "4px 0",
    }}>
      {files.map((f) => (
        <FileCard key={f.id} file={f} onClick={() => onFileClick?.(f.id)} />
      ))}
    </div>
  );
}
