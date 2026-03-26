export function normalizeDigest(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/\r\n/g, "\n");

  return normalized.length > 0 ? normalized : null;
}