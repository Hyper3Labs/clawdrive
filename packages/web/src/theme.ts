export const MAP_THEME = {
  background: "var(--bg)",
  panel: "var(--bg-panel)",
  border: "var(--border)",
  text: "var(--text)",
  textMuted: "var(--text-muted)",
  accent: "var(--accent)",
  accentGreen: "var(--accent-green)",
  accentWarm: "var(--accent-warm)",
  accentDanger: "var(--accent-danger)",
  borderSubtle: "var(--border-subtle)",

  raw: {
    background: "#061018",
    panel: "#0e1a24",
    border: "#1f3647",
    text: "#e6f0f7",
    textMuted: "#6b8a9e",
    accent: "#6ee7ff",
    accentGreen: "#7bd389",
    accentWarm: "#ffb84d",
    accentDanger: "#ff8d8d",
  },
} as const;

export const MODALITY_COLORS = {
  pdf: "#8AB4FF",
  image: "#7BD389",
  video: "#C792EA",
  audio: "#F6C177",
  text: "#9AD1FF",
} as const;

export type PreviewKind = "image" | "video" | "audio" | "pdf" | "text";

export function getPreviewKind(contentType: string): PreviewKind {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("application/pdf")) return "pdf";
  return "text";
}

export function getModalityColor(contentType: string): string {
  const kind = getPreviewKind(contentType);
  return MODALITY_COLORS[kind];
}

export function getModalityLabel(contentType: string): string {
  const kind = getPreviewKind(contentType);
  if (kind === "pdf") return "PDF";
  if (kind === "image") return "IMG";
  if (kind === "video") return "VID";
  if (kind === "audio") return "AUD";
  return "TXT";
}

export const Z_INDEX = {
  sidebar: 10,
  modal: 20,
  contextMenu: 1000,
  overlay: 50,
  toast: 9999,
} as const;

export const MINI_CARD_Z_RANGE: [number, number] = [100, 0];
