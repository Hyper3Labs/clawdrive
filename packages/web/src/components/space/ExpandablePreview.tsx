import { useEffect, useRef, useState } from "react";
import type { FileInfo, ProjectionPoint } from "../../types";
import { getModalityColor, getModalityLabel, getPreviewKind, Z_INDEX } from "../../theme";
import { fileContentUrl, getFile, getFileTags, updateFile } from "../../api";
import { useVisualizationStore } from "./useVisualizationStore";
import { TagEditor } from "../shared/TagEditor";
import { InlineEdit } from "../shared/InlineEdit";
import { DigestModal } from "../shared/DigestModal";
import { useToast } from "../shared/Toast";
import { ExternalLink } from "lucide-react";
import { cx, ui } from "../shared/ui";

function TextPreview({ point }: { point: ProjectionPoint }) {
  const [text, setText] = useState<string | null>(null);
  const contentUrl = fileContentUrl(point.id);

  useEffect(() => {
    let cancelled = false;
    fetch(contentUrl, { headers: { Range: "bytes=0-6000" } })
      .then((res) => res.text())
      .then((value) => {
        if (!cancelled) setText(value);
      })
      .catch(() => {
        if (!cancelled) setText(null);
      });

    return () => {
      cancelled = true;
    };
  }, [contentUrl]);

  if (text === null) {
    return <div className="flex h-[200px] items-center justify-center text-base text-[var(--text-muted)]">Loading...</div>;
  }

  return (
    <pre className="m-0 max-h-[280px] overflow-y-auto whitespace-pre-wrap break-words bg-transparent p-3.5 font-mono text-xs leading-[1.5] text-[var(--text)]">
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
    return <img src={contentUrl} alt={point.fileName} loading="lazy" className="block h-[280px] w-full object-contain bg-[var(--bg)]" />;
  }

  if (kind === "video") {
    return <video key={point.id} src={contentUrl} controls autoPlay muted className="block h-[280px] w-full object-contain bg-black" />;
  }

  if (kind === "audio") {
    return (
      <div className="flex items-center p-5">
        <audio key={point.id} src={contentUrl} controls className="w-full" />
      </div>
    );
  }

  if (kind === "pdf") {
    return (
      <object
        key={point.id}
        data={`${contentUrl}#toolbar=0&navpanes=0&scrollbar=0`}
        type="application/pdf"
        className="h-[360px] w-full rounded bg-white"
      >
        <div className="flex h-[200px] items-center justify-center text-[var(--text-muted)]">PDF preview unavailable</div>
      </object>
    );
  }

  if (kind === "text") {
    return <TextPreview point={point} />;
  }

  return (
    <div className="flex h-[200px] items-center justify-center text-base uppercase tracking-wider" style={{ color }}>
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

  useEffect(() => {
    setLocalTags(point.tags);
  }, [point.id, point.tags]);

  const assignedSlugs = localTags.filter((tag) => tag.startsWith("pot:")).map((tag) => tag.slice(4));
  const assignedPots = pots.filter((pot) => assignedSlugs.includes(pot.slug));
  const unassignedPots = pots.filter((pot) => !assignedSlugs.includes(pot.slug));

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      <div className={ui.eyebrow}>Pot</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {assignedPots.map((pot) => (
          <button
            key={pot.id}
            type="button"
            onClick={async () => {
              await unassignFileFromPot(point.id, pot.slug, localTags);
              setLocalTags((prev) => prev.filter((tag) => tag !== `pot:${pot.slug}`));
            }}
            className={cx(ui.accentChip, "cursor-pointer px-2.5 py-1 text-xs")}
          >
            {pot.name} ×
          </button>
        ))}
        {unassignedPots.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPicker((prev) => !prev)}
              className="flex h-[22px] w-[22px] items-center justify-center rounded-md border border-[var(--accent-a20)] bg-[var(--accent-a10)] text-sm text-[var(--accent)] transition-colors hover:bg-[var(--accent-a20)]"
            >
              +
            </button>
            {showPicker && (
              <div className={cx(ui.popover, "absolute bottom-full left-0 mb-1 min-w-[140px] p-1")}>
                {unassignedPots.map((pot) => (
                  <button
                    key={pot.id}
                    type="button"
                    onClick={async () => {
                      await assignFileToPot(point.id, pot.slug, localTags);
                      setLocalTags((prev) => [...prev, `pot:${pot.slug}`]);
                      setShowPicker(false);
                    }}
                    className="block w-full rounded px-2.5 py-1.5 text-left text-xs text-[var(--text)] transition-colors hover:bg-[var(--accent-a10)]"
                  >
                    {pot.name}
                  </button>
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

  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [showDigestModal, setShowDigestModal] = useState(false);
  const { show } = useToast();

  useEffect(() => {
    if (clickedFileId === null) {
      setDisplayedId(null);
      setOpacity(1);
      prevClickedId.current = null;
      return;
    }

    if (prevClickedId.current === null) {
      setDisplayedId(clickedFileId);
      setOpacity(1);
      prevClickedId.current = clickedFileId;
      return;
    }

    if (prevClickedId.current !== clickedFileId) {
      setOpacity(0);
      const timer = setTimeout(() => {
        setDisplayedId(clickedFileId);
        setOpacity(1);
        prevClickedId.current = clickedFileId;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [clickedFileId]);

  useEffect(() => {
    if (!displayedId) {
      setFileInfo(null);
      setTags([]);
      setShowDigestModal(false);
      return;
    }

    let cancelled = false;
    getFile(displayedId)
      .then((info: FileInfo) => {
        if (!cancelled) {
          setFileInfo(info);
          setTags(info.tags ?? []);
        }
      })
      .catch(() => {});
    getFileTags(displayedId)
      .then((res: { tags?: string[] }) => {
        if (!cancelled) setTags(res.tags ?? []);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [displayedId]);

  async function handleTagChange(newTags: string[]) {
    if (!displayedId) return;
    try {
      await updateFile(displayedId, { tags: newTags });
      setTags(newTags);
      show("Tags updated", { type: "success" });
    } catch {
      show("Failed to update tags", { type: "error" });
    }
  }

  async function handleTldrSave(value: string) {
    if (!displayedId) return;
    try {
      await updateFile(displayedId, { tldr: value || null });
      setFileInfo((prev) => (prev ? { ...prev, tldr: value || null } : prev));
      show("Saved", { type: "success" });
    } catch {
      show("Failed to save", { type: "error" });
    }
  }

  async function handleDigestSave(value: string) {
    if (!displayedId) return;
    try {
      await updateFile(displayedId, { digest: value || null });
      setFileInfo((prev) => (prev ? { ...prev, digest: value || null } : prev));
      show("Digest saved", { type: "success" });
    } catch {
      show("Failed to save digest", { type: "error" });
    }
  }

  const dismiss = () => {
    clickFile(null);
  };

  const point = points.find((entry) => entry.id === displayedId);

  if (!clickedFileId || !point) return null;

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
      className="absolute inset-0 flex items-center justify-center bg-[rgba(3,10,15,0.6)] backdrop-blur-[4px]"
      style={{ zIndex: Z_INDEX.modal }}
    >
      <div
        className={cx(ui.panel, "max-h-[80vh] w-[560px] overflow-y-auto p-5 text-base")}
        style={{
          background: "linear-gradient(135deg, rgba(8, 22, 32, 0.97), rgba(6, 16, 24, 0.97))",
          opacity,
          transition: "opacity 100ms ease",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 break-words text-lg font-semibold text-[var(--text)]">{point.fileName}</div>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={fileContentUrl(point.id)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in new tab"
              className={ui.iconButton}
            >
              <ExternalLink size={16} />
            </a>
            <button type="button" onClick={dismiss} className={ui.iconButton}>
              <span className="text-xl leading-none">×</span>
            </button>
          </div>
        </div>

        <div className={cx(ui.previewFrame, "mt-3.5")}>
          <MediaPreview point={point} />
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className={ui.eyebrow}>Type</div>
            <div className="mt-0.5 text-[var(--text)]">{point.contentType}</div>
          </div>
          <div>
            <div className={ui.eyebrow}>ID</div>
            <div className="mt-0.5 text-xs text-[var(--text)] opacity-70">{point.id.slice(0, 12)}...</div>
          </div>
        </div>

        <PotAssignment point={point} />

        <div className="mt-3 border-t border-[var(--border-subtle)] pt-2">
          <TagEditor tags={tags} onChange={handleTagChange} />
        </div>
        <div className="border-t border-[var(--border-subtle)] py-2">
          <div className={ui.sectionLabel}>Summary</div>
          <InlineEdit value={fileInfo?.tldr ?? ""} placeholder="Add a summary..." onSave={handleTldrSave} />
        </div>
        <div className="py-2">
          <button
            type="button"
            onClick={() => setShowDigestModal(true)}
            className={cx(ui.subtleButtonCompact, "text-[var(--text-muted)]")}
          >
            {fileInfo?.digest ? "Edit digest" : "Add digest"}
          </button>
        </div>
        {showDigestModal && (
          <DigestModal
            value={fileInfo?.digest ?? ""}
            onSave={handleDigestSave}
            onClose={() => setShowDigestModal(false)}
          />
        )}
      </div>
    </div>
  );
}
