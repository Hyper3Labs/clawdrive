export const MAP_THEME = {
  background: "#061018",
  panel: "#0E1A24",
  border: "#1F3647",
  text: "#E6F0F7",
  accentPrimary: "#6EE7FF",
  accentSecondary: "#7BD389",
  accentWarm: "#FFB84D",
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
  hoverCard: 15,
  modal: 20,
  contextMenu: 1000,
} as const;

export const MINI_CARD_Z_RANGE: [number, number] = [100, 0];
