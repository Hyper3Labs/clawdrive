import { useEffect, useState } from "react";
import { listFiles } from "../../api";
import type { FileInfo } from "../../types";

interface FileGridProps {
  selectedPath: string[];
}

function contentTypeIcon(ct: string): string {
  if (ct.startsWith("application/pdf")) return "\uD83D\uDCC4";
  if (ct.startsWith("image/")) return "\uD83D\uDDBC\uFE0F";
  if (ct.startsWith("video/")) return "\uD83C\uDFAC";
  if (ct.startsWith("audio/")) return "\uD83D\uDD0A";
  return "\uD83D\uDCDD";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileGrid({ selectedPath: _selectedPath }: FileGridProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listFiles({ limit: 100 })
      .then((res: { files?: FileInfo[] }) => {
        setFiles(res.files ?? []);
      })
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [_selectedPath]);

  if (loading) {
    return (
      <div style={{ padding: 24, opacity: 0.4, fontSize: 13, textAlign: "center" }}>
        Loading files...
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div style={{ padding: 24, opacity: 0.4, fontSize: 13, textAlign: "center" }}>
        No files found
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12,
        padding: "4px 0",
      }}
    >
      {files.map((f) => (
        <div
          key={f.id}
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 8,
            padding: 14,
            cursor: "pointer",
            transition: "background 0.15s, border-color 0.15s",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.06)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.03)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
          }}
        >
          <span style={{ fontSize: 24 }}>{contentTypeIcon(f.content_type)}</span>
          <div
            style={{
              fontSize: 13,
              color: "#e4e4e7",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={f.original_name}
          >
            {f.original_name}
          </div>
          <div style={{ fontSize: 11, opacity: 0.4 }}>{formatSize(f.file_size)}</div>
        </div>
      ))}
    </div>
  );
}
