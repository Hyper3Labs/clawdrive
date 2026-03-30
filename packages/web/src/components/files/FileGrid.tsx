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

// Global snippet cache — survives re-renders and re-mounts
const snippetCache = new Map<string, string>();

const FileCard = memo(function FileCard({ file, onClick, onContextMenu }: { file: FileInfo; onClick: () => void; onContextMenu: (e: React.MouseEvent) => void }) {
  const isImage = file.content_type.startsWith("image/");
  const isVideo = file.content_type.startsWith("video/");
  const isAudio = file.content_type.startsWith("audio/");
  const isPdf = file.content_type === "application/pdf";
  const isText = isTextLikeContentType(file.content_type);
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
      className="bg-[#0e1a24] border border-[#1f3647]/50 shadow-md shadow-black/20 rounded-xl cursor-pointer flex flex-col overflow-hidden mb-4 break-inside-avoid transition-all duration-200 hover:bg-[#1f3647]/40 hover:border-[#6ee7ff]/40 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/40"
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {/* Preview area — natural height for images, variable for text */}
      {isImage ? (
        <img
          src={`/api/files/${file.id}/content`}
          alt={file.name}
          className="w-full block"
          loading="lazy"
        />
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
          <pre className="text-[10px] leading-relaxed text-white/50 m-0 overflow-hidden whitespace-pre-wrap break-words max-h-40 font-mono">
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
        <div className="mt-1 text-[11px] text-white/35">{formatFileSize(file.file_size)}</div>
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
      <div className="flex flex-col items-center justify-center h-64 p-12 text-[#6b8a9e] bg-[#0e1a24] rounded-2xl border border-dashed border-[#1f3647]">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-8 w-8 mb-4 border-2 border-t-transparent border-[#6ee7ff] rounded-full animate-spin"></div>
          <span className="text-[14px] font-medium tracking-wide">Loading files...</span>
        </div>
      </div>
    );
  }

  if (displayFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 mt-8 mx-auto max-w-lg text-center bg-[#0e1a24] rounded-2xl border border-dashed border-[#1f3647]">
        <div className="w-16 h-16 mb-4 rounded-full bg-[#1f3647]/50 flex items-center justify-center opacity-50">
          <FileText size={24} className="text-[#6b8a9e]" />
        </div>
        <h3 className="text-[16px] font-bold text-[#e6f0f7] mb-2">No files found</h3>
        <p className="text-[14px] text-[#6b8a9e]">Use the Upload button or CLI to add some files to this workspace.</p>
      </div>
    );
  }

  return (
    <>
      <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-5 py-2">
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
