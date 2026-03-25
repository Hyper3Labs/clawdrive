import type { UploadResult } from "./types";

const BASE = "/api";

export async function searchFiles(
  query: string,
  opts?: { type?: string; tags?: string; pot?: string; limit?: number; minScore?: number },
) {
  const params = new URLSearchParams({ q: query });
  if (opts?.type) params.set("type", opts.type);
  if (opts?.tags) params.set("tags", opts.tags);
  if (opts?.pot) params.set("pot", opts.pot);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.minScore) params.set("minScore", String(opts.minScore));
  const res = await fetch(`${BASE}/search?${params}`);
  if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
  return res.json();
}

export async function listFiles(opts?: { limit?: number; cursor?: string; taxonomyPath?: string[] }) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.cursor) params.set("cursor", opts.cursor);
  if (opts?.taxonomyPath && opts.taxonomyPath.length > 0) {
    params.set("taxonomyPath", opts.taxonomyPath.join("/"));
  }
  const res = await fetch(`${BASE}/files?${params}`);
  if (!res.ok) throw new Error(`List failed: ${res.statusText}`);
  return res.json();
}

export async function getFile(id: string) {
  const res = await fetch(`${BASE}/files/${id}`);
  if (!res.ok) throw new Error(`Get file failed: ${res.statusText}`);
  return res.json();
}

export async function getFileTags(id: string) {
  const res = await fetch(`${BASE}/files/${id}/tags`);
  if (!res.ok) throw new Error(`Get file tags failed: ${res.statusText}`);
  return res.json();
}

export async function getTaxonomy() {
  const res = await fetch(`${BASE}/taxonomy`);
  if (!res.ok) throw new Error(`Get taxonomy failed: ${res.statusText}`);
  return res.json();
}

export async function getProjections() {
  const res = await fetch(`${BASE}/projections`);
  if (!res.ok) throw new Error(`Get projections failed: ${res.statusText}`);
  return res.json();
}

export async function recomputeProjections() {
  const res = await fetch(`${BASE}/projections/recompute`, { method: "POST" });
  if (!res.ok) throw new Error(`Recompute failed: ${res.statusText}`);
  return res.json();
}

export async function listPots() {
  const res = await fetch(`${BASE}/pots`);
  if (!res.ok) throw new Error(`List pots failed: ${res.statusText}`);
  return res.json();
}

export async function createPot(name: string) {
  const res = await fetch(`${BASE}/pots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Create pot failed: ${res.statusText}`);
  return res.json();
}

export async function renamePot(id: string, name: string) {
  const res = await fetch(`${BASE}/pots/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Rename pot failed: ${res.statusText}`);
  return res.json();
}

export async function deletePot(id: string) {
  const res = await fetch(`${BASE}/pots/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete pot failed: ${res.statusText}`);
  return res.json();
}

export async function listPotFiles(potSlug: string) {
  const res = await fetch(`${BASE}/pots/${potSlug}/files`);
  if (!res.ok) throw new Error(`List pot files failed: ${res.statusText}`);
  return res.json();
}

export const fileContentUrl = (id: string) => `/api/files/${encodeURIComponent(id)}/content`;
export const fileThumbnailUrl = (id: string) => `/api/files/${encodeURIComponent(id)}/thumbnail`;

export async function updateFile(id: string, changes: { tags?: string[]; description?: string | null; tldr?: string | null; digest?: string | null; abstract?: string | null }) {
  const res = await fetch(`${BASE}/files/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  if (!res.ok) throw new Error(`Update file failed: ${res.statusText}`);
  return res.json();
}

export async function uploadFile(
  file: File,
  opts?: { tags?: string[]; potSlug?: string },
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  const tags = [...(opts?.tags ?? [])];
  if (opts?.potSlug) tags.push(`pot:${opts.potSlug}`);
  if (tags.length > 0) form.append("tags", JSON.stringify(tags));
  const res = await fetch(`${BASE}/files/store`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
  return res.json();
}

export async function deleteFile(id: string): Promise<void> {
  const res = await fetch(`${BASE}/files/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`);
}

export async function createShare(
  potSlug: string,
  opts: { kind: "link" | "principal"; role?: "read" | "write"; principal?: string },
) {
  const res = await fetch(`${BASE}/shares/pot/${encodeURIComponent(potSlug)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(`Create share failed: ${res.statusText}`);
  return res.json();
}

export async function listShareInbox() {
  const res = await fetch(`${BASE}/shares/inbox`);
  if (!res.ok) throw new Error(`List inbox failed: ${res.statusText}`);
  return res.json();
}

export async function approveShare(ref: string) {
  const res = await fetch(`${BASE}/shares/${encodeURIComponent(ref)}/approve`, { method: "POST" });
  if (!res.ok) throw new Error(`Approve failed: ${res.statusText}`);
  return res.json();
}

export async function revokeShare(ref: string) {
  const res = await fetch(`${BASE}/shares/${encodeURIComponent(ref)}/revoke`, { method: "POST" });
  if (!res.ok) throw new Error(`Revoke failed: ${res.statusText}`);
  return res.json();
}

export async function listPotShares(potSlug: string) {
  const res = await fetch(`${BASE}/pots/${encodeURIComponent(potSlug)}/shares`);
  if (!res.ok) throw new Error(`List pot shares failed: ${res.statusText}`);
  return res.json();
}
