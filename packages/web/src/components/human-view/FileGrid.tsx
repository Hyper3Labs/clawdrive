import { useEffect, useState, useMemo, memo, useRef } from "react";
import { listFiles, listPotFiles } from "../../api";
import type { FileInfo } from "../../types";
import { PdfThumbnail } from "./PdfThumbnail";
import { ContextMenu, type ContextMenuItem } from "../shared/ContextMenu";
import { useVisualizationStore } from "../agent-view/useVisualizationStore";
import { useToast } from "../shared/Toast";

function downloadFile(fileId: string, fileName: string) {
  const a = document.createElement("a");
  a.href = `/api/files/${encodeURIComponent(fileId)}/content`;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export type SortMode = "recent" | "name" | "type" | "size";

interface FileGridProps {
  selectedPath: string[];
  potSlug?: string;
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

// Global snippet cache — survives re-renders and re-mounts
const snippetCache = new Map<string, string>();

const FileCard = memo(function FileCard({ file, onClick, onContextMenu }: { file: FileInfo; onClick: () => void; onContextMenu: (e: React.MouseEvent) => void }) {
  const isImage = file.content_type.startsWith("image/");
  const isVideo = file.content_type.startsWith("video/");
  const isAudio = file.content_type.startsWith("audio/");
  const isPdf = file.content_type === "application/pdf";
  const isText = file.content_type.startsWith("text/") || file.content_type === "application/json" || file.content_type === "application/yaml";
  const [textSnippet, setTextSnippet] = useState<string | null>(
    snippetCache.get(file.id) ?? null
  );

  useEffect(() => {
    if (isText && !snippetCache.has(file.id)) {
      fetch(`/api/files/${file.id}/content`)
        .then((r) => r.text())
        .then((t) => {
          const snippet = t.slice(0, 300);
          snippetCache.set(file.id, snippet);
          setTextSnippet(snippet);
        })
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
      onContextMenu={onContextMenu}
    >
      {/* Preview area — natural height for images, variable for text */}
      {isImage ? (
        <img
          src={`/api/files/${file.id}/content`}
          alt={file.original_name}
          style={{ width: "100%", display: "block" }}
          loading="lazy"
        />
      ) : isVideo ? (
        <video
          src={`/api/files/${file.id}/content`}
          muted
          playsInline
          preload="metadata"
          style={{ width: "100%", display: "block", background: "#000" }}
          onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
          onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
        />
      ) : isAudio ? (
        <div style={{
          height: 80, display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(135deg, rgba(251,191,36,0.1), rgba(251,191,36,0.05))",
          gap: 8,
        }}>
          <span style={{ fontSize: 28 }}>{"\uD83C\uDFB5"}</span>
          <audio
            src={`/api/files/${file.id}/content`}
            controls
            preload="metadata"
            style={{ width: "70%", height: 32 }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
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
});

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

export function FileGrid({ selectedPath, potSlug, onFileClick, sort = "recent" }: FileGridProps) {
  const [allFiles, setAllFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const onFileClickRef = useRef(onFileClick);
  onFileClickRef.current = onFileClick;
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; file: FileInfo } | null>(null);
  const [deletedCount, setDeletedCount] = useState(0);
  const scheduleDelete = useVisualizationStore((s) => s.scheduleDelete);
  const cancelDelete = useVisualizationStore((s) => s.cancelDelete);
  const pendingDeletes = useVisualizationStore((s) => s.pendingDeletes);
  const { show } = useToast();

  // Fetch once on mount
  useEffect(() => {
    setLoading(true);
    let cancelled = false;

    async function fetchAll() {
      if (potSlug) {
        const res = await listPotFiles(potSlug);
        return res.items ?? [];
      }
      const files: FileInfo[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 20; i++) {
        const res: { items?: FileInfo[]; nextCursor?: string } = await listFiles({
          limit: 100,
          cursor,
          taxonomyPath: selectedPath.length > 1 ? selectedPath : undefined,
        });
        const items = res.items ?? [];
        files.push(...items);
        if (!res.nextCursor || items.length === 0) break;
        cursor = res.nextCursor;
      }
      return files;
    }
    fetchAll()
      .then((files) => {
        if (!cancelled) {
          setAllFiles(files);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAllFiles([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPath, potSlug, deletedCount]);

  // Sort in memory after server-side filtering. Filter out pending deletes.
  const displayFiles = useMemo(() => {
    const filtered = allFiles.filter((f) => !pendingDeletes.has(f.id));
    return sortFiles(filtered, sort);
  }, [allFiles, sort, pendingDeletes]);

  if (loading) {
    return <div style={{ padding: 24, opacity: 0.4, fontSize: 13, textAlign: "center" }}>Loading files...</div>;
  }

  if (displayFiles.length === 0) {
    return <div style={{ padding: 24, opacity: 0.4, fontSize: 13, textAlign: "center" }}>No files found</div>;
  }

  return (
    <>
      <div style={{
        columnCount: 4,
        columnGap: 12,
        padding: "4px 0",
      }}>
        {displayFiles.map((f) => (
          <FileCard
            key={f.id}
            file={f}
            onClick={() => onFileClickRef.current?.(f.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu({ x: e.clientX, y: e.clientY, file: f });
            }}
          />
        ))}
      </div>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={[
            {
              label: "Download",
              onClick: () => downloadFile(ctxMenu.file.id, ctxMenu.file.original_name),
            },
            {
              label: "Delete",
              danger: true,
              onClick: () => {
                const { id, original_name } = ctxMenu.file;
                scheduleDelete(id, original_name, () => {
                  setDeletedCount((c) => c + 1);
                });
                show(`${original_name} deleted`, {
                  type: "info",
                  action: {
                    label: "Undo",
                    onClick: () => cancelDelete(id),
                  },
                });
              },
            },
          ]}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  );
}
