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
