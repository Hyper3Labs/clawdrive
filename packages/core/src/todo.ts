import { normalizeDigest } from "./digests.js";
import { getFileName, normalizeDisplayName } from "./display-names.js";
import { listFiles, type ManageOptions } from "./manage.js";
import { normalizeTldr } from "./metadata.js";

export type TodoKind = "tldr" | "digest" | "display_name";

export interface TodoItem {
  id: string;
  name: string;
  originalName: string;
  missing: TodoKind[];
  taxonomyPath: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ListTodosInput {
  limit?: number;
  cursor?: string;
  kinds?: TodoKind[];
  taxonomyPath?: string[];
}

export interface ListTodosResult {
  items: TodoItem[];
  nextCursor?: string;
  total: number;
}

const DEFAULT_TODO_KINDS: TodoKind[] = ["tldr", "digest", "display_name"];

function getMissingKinds(
  record: {
    id: string;
    tldr: string | null;
    digest: string | null;
    abstract?: string | null;
    description: string | null;
    display_name: string | null;
  },
): TodoKind[] {
  const missing: TodoKind[] = [];
  const tldr = normalizeTldr(record.tldr ?? record.abstract ?? record.description ?? null);
  const digest = normalizeDigest(record.digest);
  const displayName = normalizeDisplayName(record.display_name);

  if (tldr == null) {
    missing.push("tldr");
  }
  if (digest == null) {
    missing.push("digest");
  }
  if (displayName == null) {
    missing.push("display_name");
  }

  return missing;
}

export async function listTodos(
  input: ListTodosInput,
  opts: ManageOptions,
): Promise<ListTodosResult> {
  const limit = input.limit ?? 50;
  const requestedKinds = new Set(input.kinds?.length ? input.kinds : DEFAULT_TODO_KINDS);
  const files = await listFiles({ limit: 1_000_000, taxonomyPath: input.taxonomyPath }, opts);

  let items = files.items
    .map((item) => {
      const missing = getMissingKinds(item)
        .filter((kind) => requestedKinds.has(kind));

      return {
        id: item.id,
        name: getFileName(item),
        originalName: item.original_name,
        missing,
        taxonomyPath: item.taxonomy_path,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      } satisfies TodoItem;
    })
    .filter((item) => item.missing.length > 0);

  const total = items.length;

  if (input.cursor) {
    const cursorIdx = items.findIndex((item) => item.id === input.cursor);
    if (cursorIdx >= 0) {
      items = items.slice(cursorIdx + 1);
    }
  }

  const hasMore = items.length > limit;
  const pageItems = items.slice(0, limit);
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id : undefined;

  return {
    items: pageItems,
    nextCursor,
    total,
  };
}