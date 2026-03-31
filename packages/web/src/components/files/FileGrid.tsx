import { useEffect, useState, useMemo, memo, useRef } from "react";
import type { ReactNode } from "react";
import { downloadFileContent, listFiles, listPotFiles } from "../../api";
import type { FileInfo } from "../../types";
import { PdfThumbnail } from "./PdfThumbnail";
import { ContextMenu, type ContextMenuItem } from "../shared/ContextMenu";
import { useVisualizationStore } from "../space/useVisualizationStore";
import { useToast } from "../shared/Toast";
import { FileText, Video, Volume2, FileCode, Music } from "lucide-react";
import { formatFileSize, isTextLikeContentType } from "../../utils/files";
import { Masonry } from "react-plock";

export type SortMode = "recent" | "name" | "type" | "size";

interface FileGridProps {
  potSlug?: string;
  onFileClick?: (fileId: string) => void;
  sort?: SortMode;
}

function contentTypeIcon(ct: string, size = 16): ReactNode {
  if (ct.startsWith("application/pdf")) return <FileText size={size} />;
  if (ct.startsWith("video/")) return <Video size={size} />;
  if (ct.startsWith("audio/")) return <Volume2 size={size} />;
  return <FileCode size={size} />;
}

// Global caches — survive re-renders and re-mounts
const snippetCache = new Map<string, string>();
const imageBlobCache = new Map<string, string>();

const FileCard = memo(function FileCard({ file, onClick, onContextMenu }: { file: FileInfo; onClick: () => void; onContextMenu: (e: React.MouseEvent) => void }) {
  const isImage = file.content_type.startsWith("image/");
  const isVideo = file.content_type.startsWith("video/");
  const isAudio = file.content_type.startsWith("audio/");
  const isPdf = file.content_type === "application/pdf";
  const isText = isTextLikeContentType(file.content_type);
  const [textSnippet, setTextSnippet] = useState<string | null>(
    snippetCache.get(file.id) ?? null
  );
  const [imageSrc, setImageSrc] = useState<string | null>(
    imageBlobCache.get(file.id) ?? null
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

  // Cache image blob URLs so remounts show instantly
  useEffect(() => {
    if (isImage && !imageBlobCache.has(file.id)) {
      fetch(`/api/files/${file.id}/content`)
        .then((r) => r.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          imageBlobCache.set(file.id, url);
          setImageSrc(url);
        })
        .catch(() => {});
    }
  }, [file.id, isImage]);

  return (
    <div
      className="bg-[var(--bg-panel)] border border-[var(--border)]/50 shadow-md shadow-black/20 rounded-xl cursor-pointer flex flex-col overflow-hidden transition-all duration-200 hover:bg-[var(--border)]/40 hover:border-[var(--accent)]/40 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/40"
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {/* Preview area — natural height for images, variable for text */}
      {isImage ? (
        <div className="bg-[var(--surface-1)]">
          <img
            src={imageSrc ?? `/api/files/${file.id}/content`}
            alt={file.name}
            className="w-full block"
            loading={imageSrc ? undefined : "lazy"}
          />
        </div>
      ) : isVideo ? (
        <video
          src={`/api/files/${file.id}/content`}
          muted
          playsInline
          preload="metadata"
          className="w-full block bg-black"
          onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
          onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
        />
      ) : isAudio ? (
        <div className="h-20 flex items-center justify-center bg-gradient-to-br from-[rgba(251,191,36,0.1)] to-[rgba(251,191,36,0.05)] gap-2">
          <Music size={28} />
          <audio
            src={`/api/files/${file.id}/content`}
            controls
            preload="metadata"
            className="w-[70%] h-8"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : isPdf ? (
        <PdfThumbnail url={`/api/files/${file.id}/content`} />
      ) : isText && textSnippet ? (
        <div className="bg-black/25 p-3">
          <pre className="text-xs leading-relaxed text-[var(--text-faint)] m-0 overflow-hidden whitespace-pre-wrap break-words max-h-40 font-mono">
            {textSnippet}
          </pre>
        </div>
      ) : (
        <div className="h-20 flex items-center justify-center bg-black/20">
          <div className="opacity-30">{contentTypeIcon(file.content_type, 36)}</div>
        </div>
      )}

      {/* File info */}
      <div className="px-3 py-2.5">
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[var(--text)]" title={file.name}>
          {file.name}
        </div>
        <div className="mt-1 text-xs text-[var(--text-faint)]">{formatFileSize(file.file_size)}</div>
      </div>
    </div>
  );
});

function sortFiles(files: FileInfo[], mode: SortMode): FileInfo[] {
  const sorted = [...files];
  switch (mode) {
    case "name":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "type":
      return sorted.sort((a, b) => a.content_type.localeCompare(b.content_type) || a.name.localeCompare(b.name));
    case "size":
      return sorted.sort((a, b) => b.file_size - a.file_size);
    case "recent":
    default:
      return sorted.sort((a, b) => b.created_at - a.created_at);
  }
}

export function FileGrid({ potSlug, onFileClick, sort = "recent" }: FileGridProps) {
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

  // Fetch on mount and when pot changes — keep showing old cards while fetching
  useEffect(() => {
    if (allFiles.length === 0) setLoading(true);
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
  }, [potSlug, deletedCount]);

  // Sort in memory after server-side filtering. Filter out pending deletes.
  const displayFiles = useMemo(() => {
    const filtered = allFiles.filter((f) => !pendingDeletes.has(f.id));
    return sortFiles(filtered, sort);
  }, [allFiles, sort, pendingDeletes]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 p-12 text-[var(--text-muted)] bg-[var(--bg-panel)] rounded-2xl border border-dashed border-[var(--border)]">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-8 w-8 mb-4 border-2 border-t-transparent border-[var(--accent)] rounded-full animate-spin"></div>
          <span className="text-lg font-medium tracking-wide">Loading files...</span>
        </div>
      </div>
    );
  }

  if (displayFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 mt-8 mx-auto max-w-lg text-center bg-[var(--bg-panel)] rounded-2xl border border-dashed border-[var(--border)]">
        <div className="w-16 h-16 mb-4 rounded-full bg-[var(--border)]/50 flex items-center justify-center opacity-50">
          <FileText size={24} className="text-[var(--text-muted)]" />
        </div>
        <h3 className="text-xl font-bold text-[var(--text)] mb-2">No files found</h3>
        <p className="text-lg text-[var(--text-muted)]">Use the Upload button or CLI to add some files to this workspace.</p>
      </div>
    );
  }

  return (
    <>
      <Masonry
        items={displayFiles}
        config={{
          columns: [2, 3, 4, 5],
          gap: [16, 16, 20, 20],
          media: [640, 768, 1024, 1280],
          useBalancedLayout: true,
        }}
        className="py-2"
        render={(f) => (
          <FileCard
            key={f.id}
            file={f}
            onClick={() => onFileClickRef.current?.(f.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu({ x: e.clientX, y: e.clientY, file: f });
            }}
          />
        )}
      />
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={[
            {
              label: "Download",
              onClick: () => downloadFileContent(ctxMenu.file.id, ctxMenu.file.name),
            },
            {
              label: "Delete",
              danger: true,
              onClick: () => {
                const { id, name } = ctxMenu.file;
                scheduleDelete(id, name, () => {
                  setDeletedCount((c) => c + 1);
                });
                show(`${name} deleted`, {
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
