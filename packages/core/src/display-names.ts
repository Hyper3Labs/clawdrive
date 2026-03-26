import { parse } from "node:path";

export function normalizeDisplayName(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function getFileName(record: { original_name: string; display_name: string | null | undefined }): string {
  return normalizeDisplayName(record.display_name) ?? record.original_name;
}

function normalizeFileNameKey(value: string): string {
  return value.trim().toLowerCase();
}

export function ensureUniqueFileName(name: string, existingNames: Iterable<string>): string {
  const used = new Set(Array.from(existingNames, (value) => normalizeFileNameKey(value)));
  const desiredKey = normalizeFileNameKey(name);
  if (!used.has(desiredKey)) {
    return name;
  }

  const parsed = parse(name);
  const stem = parsed.ext.length > 0 ? parsed.name : parsed.base;
  const ext = parsed.ext.length > 0 ? parsed.ext : "";

  let index = 2;
  while (true) {
    const candidate = `${stem} (${index})${ext}`;
    if (!used.has(normalizeFileNameKey(candidate))) {
      return candidate;
    }
    index += 1;
  }
}
