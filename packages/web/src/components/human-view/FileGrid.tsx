import { useEffect, useState, useMemo } from "react";
import { listFiles } from "../../api";
import type { FileInfo } from "../../types";
import { PdfThumbnail } from "./PdfThumbnail";

export type SortMode = "recent" | "name" | "type" | "size";

interface FileGridProps {
  selectedPath: string[];
  onFileClick?: (fileId: string) => void;
  sort?: SortMode;
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
  const isPdf = file.content_type === "application/pdf";
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
      ) : isPdf ? (
        <PdfThumbnail url={`/api/files/${file.id}/content`} />
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

function sortFiles(files: FileInfo[], mode: SortMode): FileInfo[] {
  const sorted = [...files];
  switch (mode) {
    case "name":
      return sorted.sort((a, b) => a.original_name.localeCompare(b.original_name));
    case "type":
      return sorted.sort((a, b) => a.content_type.localeCompare(b.content_type) || a.original_name.localeCompare(b.original_name));
    case "size":
      return sorted.sort((a, b) => b.file_size - a.file_size);
    case "recent":
    default:
      return sorted.sort((a, b) => b.created_at - a.created_at);
  }
}

export function FileGrid({ selectedPath, onFileClick, sort = "recent" }: FileGridProps) {
  const [allFiles, setAllFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch once on mount
  useEffect(() => {
    setLoading(true);
    async function fetchAll() {
      const files: FileInfo[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 20; i++) {
        const res: { items?: FileInfo[]; nextCursor?: string } = await listFiles({ limit: 100, cursor });
        const items = res.items ?? [];
        files.push(...items);
        if (!res.nextCursor || items.length === 0) break;
        cursor = res.nextCursor;
      }
      return files;
    }
    fetchAll()
      .then(setAllFiles)
      .catch(() => setAllFiles([]))
      .finally(() => setLoading(false));
  }, []); // fetch once on mount

  // Filter + sort in memory (no refetch)
  const displayFiles = useMemo(() => {
    let filtered = allFiles;
    if (selectedPath.length > 1) {
      const byPath = allFiles.filter((f: any) => {
        const tp: string[] = f.taxonomy_path ?? [];
        return selectedPath.every((seg) => tp.includes(seg));
      });
      if (byPath.length > 0) filtered = byPath;
    }
    return sortFiles(filtered, sort);
  }, [allFiles, selectedPath, sort]);

  if (loading) {
    return <div style={{ padding: 24, opacity: 0.4, fontSize: 13, textAlign: "center" }}>Loading files...</div>;
  }

  if (displayFiles.length === 0) {
    return <div style={{ padding: 24, opacity: 0.4, fontSize: 13, textAlign: "center" }}>No files found</div>;
  }

  return (
    <div style={{
      columnCount: 4,
      columnGap: 12,
      padding: "4px 0",
    }}>
      {displayFiles.map((f) => (
        <FileCard key={f.id} file={f} onClick={() => onFileClick?.(f.id)} />
      ))}
    </div>
  );
}
