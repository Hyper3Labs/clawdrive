import { useEffect, useState } from "react";
import { downloadFileContent, getFile, getFileTags, updateFile } from "../../api";
import type { FileInfo } from "../../types";
import { TagEditor } from "../shared/TagEditor";
import { InlineEdit } from "../shared/InlineEdit";
import { DigestModal } from "../shared/DigestModal";
import { useToast } from "../shared/Toast";
import { Download } from "lucide-react";
import { formatFileSize, isTextLikeContentType } from "../../utils/files";

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
        if (isTextLikeContentType(f.content_type)) {
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
      <div className="w-[360px] xl:w-[400px] bg-[var(--bg-panel)] border-l border-[var(--border)] flex flex-col flex-shrink-0">
        <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--border-subtle)]">
          <span className="opacity-40 text-sm">Loading...</span>
          <button onClick={onClose} className="bg-transparent border-none text-[var(--text)] opacity-40 hover:opacity-100 cursor-pointer p-1 rounded hover:bg-[var(--surface-3)] text-lg flex items-center justify-center -mr-1">x</button>
        </div>
      </div>
    );
  }

  if (!file) return null;

  const isImage = file.content_type?.startsWith("image/");
  const isVideo = file.content_type?.startsWith("video/");
  const isAudio = file.content_type?.startsWith("audio/");
  const isText = isTextLikeContentType(file.content_type);
  const isPdf = file.content_type === "application/pdf";

  return (
    <div className="w-[360px] xl:w-[400px] bg-[var(--bg-panel)] border-l border-[var(--border)] flex flex-col flex-shrink-0">
      <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--border-subtle)] gap-2">
        <span className="font-bold text-sm overflow-hidden text-ellipsis whitespace-nowrap flex-1">
          {file.name}
        </span>
        <button
          onClick={() => downloadFileContent(fileId, file.name)}
          className="bg-transparent border-none text-[var(--text)] opacity-40 hover:opacity-100 cursor-pointer p-1 rounded hover:bg-[var(--surface-3)] flex items-center justify-center"
          title="Download"
        >
          <Download size={14} />
        </button>
        <button onClick={onClose} className="bg-transparent border-none text-[var(--text)] opacity-40 hover:opacity-100 cursor-pointer p-1 rounded hover:bg-[var(--surface-3)] text-lg flex items-center justify-center -mr-1">×</button>
      </div>

      {/* Metadata */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] text-xs">
        <div className="flex gap-4 flex-wrap opacity-60">
          <span>{file.content_type}</span>
          <span>{formatFileSize(file.file_size)}</span>
          <span>{new Date(file.created_at).toLocaleDateString()}</span>
        </div>
        {file.source_url && (
          <div className="mt-2">
            <a
              href={file.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[var(--accent)] no-underline hover:underline"
            >
              Open source
            </a>
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="px-4 py-2 border-b border-[var(--border-subtle)]">
        <TagEditor tags={tags} onChange={handleTagChange} />
      </div>

      {/* Summary */}
      <div className="px-4 py-2 border-b border-[var(--border-subtle)]">
        <div className="text-[11px] opacity-40 mb-1 uppercase tracking-wider">Summary</div>
        <InlineEdit
          value={file.tldr ?? ""}
          placeholder="Add a summary..."
          onSave={handleTldrSave}
        />
      </div>

      {/* Digest button */}
      <div className="px-4 py-2 border-b border-[var(--border-subtle)]">
        <button
          onClick={() => setShowDigestModal(true)}
          className="cursor-pointer rounded border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)]"
        >
          {file.digest ? "Edit digest" : "Add digest"}
        </button>
      </div>

      {/* Content preview */}
      <div className={`flex-1 overflow-auto flex flex-col ${isPdf ? 'p-0' : 'p-4'}`}>
        {file.digest && (
          <div className="mb-4 p-3 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)]">
            <div className="mb-2 text-[11px] tracking-[0.08em] uppercase opacity-[0.55]">
              Digest
            </div>
            <pre className="m-0 whitespace-pre-wrap break-words text-xs leading-[1.6] text-[var(--text)]">
              {file.digest}
            </pre>
          </div>
        )}
        {isImage && (
          <img
            src={`/api/files/${fileId}/content`}
            alt={file.name}
            className="max-w-full rounded-md"
          />
        )}
        {isText && textContent !== null && (
          <pre className="font-mono text-xs leading-[1.6] whitespace-pre-wrap break-words text-[var(--text)] m-0">
            {textContent}
          </pre>
        )}
        {isVideo && (
          <video
            src={`/api/files/${fileId}/content`}
            controls
            className="w-full rounded-md bg-black"
          />
        )}
        {isAudio && (
          <div className="pt-5">
            <audio
              src={`/api/files/${fileId}/content`}
              controls
              className="w-full"
            />
          </div>
        )}
        {isPdf && (
          <iframe
            src={`/api/files/${fileId}/content`}
            className="w-full h-full border-none rounded-md bg-white"
            title={file.name}
          />
        )}
        {!isImage && !isVideo && !isAudio && !isText && !isPdf && (
          <div className="text-center opacity-40 pt-10 text-[13px]">
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
