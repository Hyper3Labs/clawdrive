const BASE = "/api";

export async function searchFiles(query: string, opts?: Record<string, string>) {
  const params = new URLSearchParams({ q: query, ...opts });
  const res = await fetch(`${BASE}/search?${params}`);
  if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
  return res.json();
}

export async function listFiles(opts?: { limit?: number; cursor?: string }) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.cursor) params.set("cursor", opts.cursor);
  const res = await fetch(`${BASE}/files?${params}`);
  if (!res.ok) throw new Error(`List failed: ${res.statusText}`);
  return res.json();
}

export async function getFile(id: string) {
  const res = await fetch(`${BASE}/files/${id}`);
  if (!res.ok) throw new Error(`Get file failed: ${res.statusText}`);
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

export async function updateFile(id: string, changes: { tags?: string[]; description?: string }) {
  const res = await fetch(`${BASE}/files/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  if (!res.ok) throw new Error(`Update file failed: ${res.statusText}`);
  return res.json();
}
