# Frontend-Backend Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all frontend-backend functionality gaps — file upload, delete, download, metadata editing, pot management, sharing UI, and search filters.

**Architecture:** Light infrastructure pass (toast, context menu, drop zone), then vertical feature slices. Files view becomes the primary CRUD surface. Space view stays exploration-focused with lightweight actions. All new shared components go in `packages/web/src/components/shared/`.

**Tech Stack:** React 19, Zustand 5, Vite 6, TypeScript 5, inline CSS with MAP_THEME tokens. No CSS framework. No test infrastructure in web package (manual verification via dev server).

**Spec:** `docs/superpowers/specs/2026-03-25-frontend-backend-parity-design.md`

---

## File Map

### New Files
| File | Responsibility |
|---|---|
| `packages/web/src/components/shared/Toast.tsx` | Toast notification system (provider + hook) |
| `packages/web/src/components/shared/ContextMenu.tsx` | Reusable context menu component |
| `packages/web/src/components/shared/DropZone.tsx` | Drag-and-drop file upload zone |
| `packages/web/src/components/shared/InlineEdit.tsx` | Click-to-edit text field |
| `packages/web/src/components/shared/TagEditor.tsx` | Tag chip editor with add/remove |
| `packages/web/src/components/shared/DigestModal.tsx` | Modal for editing markdown digest |
| `packages/web/src/components/shared/FileSearchPicker.tsx` | Search popover for adding files to pots |
| `packages/web/src/components/shared/SharePopover.tsx` | Share management popover for pots |
| `packages/web/src/components/shared/ShareInbox.tsx` | Top bar share inbox dropdown |
| `packages/web/src/components/shared/SearchFilters.tsx` | Type/pot/tags filter chips for search |
| `packages/web/src/components/human-view/PotsSidebar.tsx` | Pots section for Files view sidebar |
| `packages/web/src/hooks/useUploadQueue.ts` | Upload queue with concurrency control |

### Modified Files
| File | Changes |
|---|---|
| `packages/web/src/types.ts` | Add `tags` to `FileInfo`, add `PotShare` + `UploadResult` types |
| `packages/web/src/api.ts` | Add `uploadFile`, `deleteFile`, share API functions, `listPotShares` |
| `packages/web/src/App.tsx` | Wrap with `ToastProvider` |
| `packages/web/src/components/TopBar.tsx` | Add upload button + share inbox icon |
| `packages/web/src/components/human-view/TaxonomyBrowser.tsx` | Add pots sidebar section, DropZone wrapper, pot/taxonomy mutual exclusion |
| `packages/web/src/components/human-view/FileGrid.tsx` | Add context menu (right-click) on file cards |
| `packages/web/src/components/human-view/FilePreview.tsx` | Add download button, tag editor, inline TL;DR edit, digest modal |
| `packages/web/src/components/agent-view/PotsSidebar.tsx` | Extract context menu, add per-pot upload (+), share button, file picker |
| `packages/web/src/components/agent-view/useVisualizationStore.ts` | Add `selectedPotSlugForFilesView`, `pendingDeletes` |
| `packages/web/src/components/agent-view/ExpandablePreview.tsx` | Add inline tag/tldr editing |
| `packages/web/src/components/InlineSearch.tsx` | Integrate SearchFilters component |
| `packages/server/src/routes/pots.ts` | Add `GET /api/pots/:pot/shares` endpoint |
| `packages/server/src/routes/files.ts` | Add `type` and `tags` query params to `GET /api/files` |
| `packages/core/src/shares.ts` | Add `listPotShares()` function |
| `packages/core/src/manage.ts` | Add `type` and `tags` filter support to `listFiles()` |

---

## Task 1: Types & API Layer Extensions

**Files:**
- Modify: `packages/web/src/types.ts`
- Modify: `packages/web/src/api.ts`

- [ ] **Step 1: Extend FileInfo with tags**

In `packages/web/src/types.ts`, add `tags` to `FileInfo`:

```typescript
export interface FileInfo {
  id: string;
  original_name: string;
  content_type: string;
  file_size: number;
  tags: string[];                    // ADD THIS
  tldr?: string | null;
  abstract?: string | null;
  digest?: string | null;
  description?: string | null;
  created_at: number;
  updated_at: number;
  source_url?: string | null;
}
```

- [ ] **Step 2: Add new types**

Add to `packages/web/src/types.ts`:

```typescript
export interface UploadResult {
  id: string;
  fileHash: string;
  status: "stored" | "duplicate";
  duplicateId?: string;
  chunks: number;
  tokensUsed: number;
}

export interface PotShare {
  id: string;
  pot_id: string;
  pot_slug: string;
  kind: "link" | "principal";
  principal: string | null;
  role: "read" | "write";
  status: "pending" | "active" | "revoked" | "expired";
  token: string | null;
  expires_at: number | null;
  created_at: number;
  approved_at: number | null;
  revoked_at: number | null;
}
```

- [ ] **Step 3: Add API functions**

Add to `packages/web/src/api.ts`:

```typescript
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
```

Add the import for `UploadResult` at the top of `api.ts`.

- [ ] **Step 4: Verify build**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors (existing code that uses `FileInfo` may need `tags` added where objects are constructed — check and fix any errors).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/types.ts packages/web/src/api.ts
git commit -m "feat(web): extend types and API layer for frontend-backend parity"
```

---

## Task 2: Toast Notification System

**Files:**
- Create: `packages/web/src/components/shared/Toast.tsx`
- Modify: `packages/web/src/App.tsx`

- [ ] **Step 1: Create Toast component**

Create `packages/web/src/components/shared/Toast.tsx`:

```tsx
import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { MAP_THEME } from "../../theme";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  type?: "success" | "error" | "info";
  duration?: number;
  action?: ToastAction;
}

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "info";
  action?: ToastAction;
}

interface ToastContextValue {
  show: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const MAX_TOASTS = 3;

const BORDER_COLORS: Record<string, string> = {
  success: MAP_THEME.accentSecondary,
  error: "#ff8d8d",
  info: MAP_THEME.accentPrimary,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string, options?: ToastOptions) => {
    const id = nextId.current++;
    const type = options?.type ?? "info";
    const duration = options?.duration ?? (options?.action ? 8000 : 4000);
    const item: ToastItem = { id, message, type, action: options?.action };

    setToasts((prev) => {
      const next = [...prev, item];
      return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next;
    });

    window.setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div style={{
        position: "fixed", bottom: 20, right: 20, zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
      }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: MAP_THEME.panel,
              border: `1px solid ${BORDER_COLORS[t.type]}`,
              borderRadius: 8,
              padding: "10px 16px",
              fontSize: 13,
              color: MAP_THEME.text,
              display: "flex",
              alignItems: "center",
              gap: 12,
              pointerEvents: "auto",
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              animation: "toast-in 0.2s ease-out",
              maxWidth: 360,
            }}
          >
            <span style={{ flex: 1 }}>{t.message}</span>
            {t.action && (
              <button
                onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: MAP_THEME.accentPrimary, fontWeight: 600,
                  fontSize: 13, padding: "2px 8px", flexShrink: 0,
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: MAP_THEME.textMuted, fontSize: 16, padding: 0,
                lineHeight: 1, flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
```

- [ ] **Step 2: Wrap App with ToastProvider**

In `packages/web/src/App.tsx`, import `ToastProvider` and wrap the root div:

```tsx
import { ToastProvider } from "./components/shared/Toast";
// ... existing imports

export function App() {
  // ... existing state/effects

  return (
    <ToastProvider>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        {/* ... existing content unchanged ... */}
      </div>
    </ToastProvider>
  );
}
```

- [ ] **Step 3: Verify build + manual test**

Run: `cd packages/web && npx tsc --noEmit`

Manual test: Start dev server (`npm run dev` in web package), open browser. Temporarily add `useToast().show("Hello")` to a component onClick to verify toasts appear and auto-dismiss.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/shared/Toast.tsx packages/web/src/App.tsx
git commit -m "feat(web): add toast notification system with undo support"
```

---

## Task 3: Shared Context Menu

**Files:**
- Create: `packages/web/src/components/shared/ContextMenu.tsx`
- Modify: `packages/web/src/components/agent-view/PotsSidebar.tsx`

- [ ] **Step 1: Create shared ContextMenu component**

Create `packages/web/src/components/shared/ContextMenu.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { MAP_THEME, Z_INDEX } from "../../theme";

export interface ContextMenuItem {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: Z_INDEX.contextMenu,
        background: MAP_THEME.panel,
        border: `1px solid ${MAP_THEME.border}`,
        borderRadius: 6,
        padding: "4px 0",
        minWidth: 140,
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.onClick(); onClose(); }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = item.danger
              ? "rgba(255,100,100,0.15)"
              : "rgba(110,231,255,0.1)";
          }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          style={{
            display: "block",
            width: "100%",
            padding: "6px 12px",
            border: "none",
            background: "transparent",
            color: item.danger ? "#ff8d8d" : MAP_THEME.text,
            fontSize: 12,
            textAlign: "left",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Refactor PotsSidebar to use shared ContextMenu**

In `packages/web/src/components/agent-view/PotsSidebar.tsx`:
- Remove the inline `ContextMenu` function component (approximately lines 5–90)
- Import from shared: `import { ContextMenu } from "../shared/ContextMenu";`
- The pot context menu now needs rename/delete logic. The state for `renaming` and `newName` stays in PotsSidebar — but the menu items are passed as `ContextMenuItem[]`.
- When "Rename" is clicked, set local `renamingPotId` state (instead of rendering rename input inside the menu). Show an inline input in the pot list item itself.
- When "Delete" is clicked, call `deletePot` directly.

Preserve all existing pot sidebar behavior (collapse, create, select, file count display).

- [ ] **Step 3: Verify build + manual test**

Run: `cd packages/web && npx tsc --noEmit`

Manual test: Right-click a pot in Space view → context menu appears with Rename/Delete. Rename and Delete should work as before.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/shared/ContextMenu.tsx packages/web/src/components/agent-view/PotsSidebar.tsx
git commit -m "feat(web): extract shared ContextMenu component from PotsSidebar"
```

---

## Task 4: Drop Zone Component

**Files:**
- Create: `packages/web/src/components/shared/DropZone.tsx`

- [ ] **Step 1: Create DropZone component**

Create `packages/web/src/components/shared/DropZone.tsx`:

```tsx
import { useState, useRef, type ReactNode, type DragEvent } from "react";
import { MAP_THEME } from "../../theme";

interface DropZoneProps {
  onDrop: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
  children: ReactNode;
  /** When true, makes the overlay absolute within the parent (for nested zones) */
  nested?: boolean;
}

export function DropZone({
  onDrop,
  disabled,
  label = "Drop files here",
  children,
  nested,
}: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragCounter.current++;
    if (dragCounter.current === 1) setDragOver(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragOver(false);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onDrop(files);
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ position: "relative", display: "contents" }}
    >
      {children}
      {dragOver && (
        <div
          style={{
            position: nested ? "absolute" : "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(6, 16, 24, 0.85)",
            border: `2px dashed ${MAP_THEME.accentPrimary}`,
            borderRadius: nested ? 8 : 0,
            pointerEvents: "none",
          }}
        >
          <span style={{
            color: MAP_THEME.accentPrimary,
            fontSize: 16,
            fontWeight: 600,
          }}>
            {label}
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/web && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/shared/DropZone.tsx
git commit -m "feat(web): add DropZone component for drag-and-drop file upload"
```

---

## Task 5: File Upload

**Files:**
- Create: `packages/web/src/hooks/useUploadQueue.ts`
- Modify: `packages/web/src/components/TopBar.tsx`
- Modify: `packages/web/src/components/human-view/TaxonomyBrowser.tsx`
- Modify: `packages/web/src/components/agent-view/PotsSidebar.tsx`

- [ ] **Step 1: Create upload queue hook**

Create `packages/web/src/hooks/useUploadQueue.ts`:

```tsx
import { useRef, useCallback } from "react";
import { uploadFile } from "../api";
import { useToast } from "../components/shared/Toast";

const MAX_CONCURRENT = 3;

export function useUploadQueue(opts?: {
  potSlug?: string;
  onComplete?: () => void;
}) {
  const { show } = useToast();
  const activeRef = useRef(0);
  const queueRef = useRef<File[]>([]);

  const processQueue = useCallback(async () => {
    while (queueRef.current.length > 0 && activeRef.current < MAX_CONCURRENT) {
      const file = queueRef.current.shift()!;
      activeRef.current++;
      try {
        const result = await uploadFile(file, { potSlug: opts?.potSlug });
        if (result.status === "duplicate") {
          show(`${file.name} already exists`, { type: "info" });
        } else {
          show(`${file.name} uploaded`, { type: "success" });
        }
      } catch (err) {
        show(`Failed to upload ${file.name}`, { type: "error" });
      } finally {
        activeRef.current--;
        processQueue();
      }
    }
    if (activeRef.current === 0 && queueRef.current.length === 0) {
      opts?.onComplete?.();
    }
  }, [show, opts]);

  const enqueue = useCallback((files: File[]) => {
    queueRef.current.push(...files);
    show(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}...`, { type: "info" });
    processQueue();
  }, [processQueue, show]);

  return { enqueue };
}
```

- [ ] **Step 2: Add upload button to TopBar**

In `packages/web/src/components/TopBar.tsx`:
- Add a hidden `<input type="file" multiple>` ref
- Add an upload button (cloud icon) between ViewTabs and file count
- On click: trigger file input
- On file select: call `enqueue(files)` from `useUploadQueue`

The upload button should be a simple `<button>` styled like the existing top bar elements:

```tsx
<button
  onClick={() => fileInputRef.current?.click()}
  style={{
    background: "rgba(255,255,255,0.06)",
    border: `1px solid ${MAP_THEME.border}`,
    borderRadius: 6,
    padding: "6px 12px",
    color: MAP_THEME.text,
    fontSize: 12,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
  }}
  title="Upload files"
>
  ↑ Upload
</button>
<input
  ref={fileInputRef}
  type="file"
  multiple
  style={{ display: "none" }}
  onChange={(e) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) enqueue(files);
    e.target.value = "";
  }}
/>
```

TopBar needs access to `useToast` (already available via context) and will need an `onUploadComplete` callback prop to trigger file list refresh.

- [ ] **Step 3: Add global DropZone to TaxonomyBrowser**

In `packages/web/src/components/human-view/TaxonomyBrowser.tsx`:
- Import `DropZone` from shared
- Import `useUploadQueue`
- Wrap the outermost `<div>` with `<DropZone onDrop={enqueue}>`
- Pass a callback to refresh the file grid after upload completes (increment a `refreshKey` state to force FileGrid remount)

- [ ] **Step 4: Add per-pot upload to PotsSidebar**

In `packages/web/src/components/agent-view/PotsSidebar.tsx`:
- Add a "+" icon button next to each pot name
- On click: open hidden file input with `potSlug` set
- The pot list items should also act as drop targets:
  - Wrap each pot `<div>` in a mini drag handler that detects file drops
  - On drop: call `enqueue(files)` with the pot's slug

- [ ] **Step 5: Verify build + manual test**

Run: `cd packages/web && npx tsc --noEmit`

Manual test:
- Click "Upload" in top bar → file picker opens → select file → toast shows "uploading" then "uploaded"
- Drag file onto Files view → overlay appears → drop → file uploads
- Click "+" on a pot → file picker → file uploads into that pot

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/hooks/useUploadQueue.ts \
  packages/web/src/components/TopBar.tsx \
  packages/web/src/components/human-view/TaxonomyBrowser.tsx \
  packages/web/src/components/agent-view/PotsSidebar.tsx
git commit -m "feat(web): add file upload with global drop zone and per-pot upload"
```

---

## Task 6: File Delete & Download

**Files:**
- Modify: `packages/web/src/components/agent-view/useVisualizationStore.ts`
- Modify: `packages/web/src/components/human-view/FileGrid.tsx`
- Modify: `packages/web/src/components/human-view/FilePreview.tsx`

- [ ] **Step 1: Add pending deletes to store**

In `packages/web/src/components/agent-view/useVisualizationStore.ts`, add to the state interface and implementation:

```typescript
// Add to state
pendingDeletes: Map<string, { timer: ReturnType<typeof setTimeout>; fileName: string }>;

// Add action
scheduleDelete: (id: string, fileName: string, onComplete: () => void) => void;
cancelDelete: (id: string) => void;
```

Implementation:
```typescript
pendingDeletes: new Map(),

scheduleDelete: (id, fileName, onComplete) => {
  const timer = window.setTimeout(async () => {
    try {
      await deleteFile(id);
    } catch {}
    get().pendingDeletes.delete(id);
    set({ pendingDeletes: new Map(get().pendingDeletes) });
    onComplete();
  }, 8000);
  const next = new Map(get().pendingDeletes);
  next.set(id, { timer, fileName });
  set({ pendingDeletes: next });
},

cancelDelete: (id) => {
  const entry = get().pendingDeletes.get(id);
  if (entry) {
    clearTimeout(entry.timer);
    const next = new Map(get().pendingDeletes);
    next.delete(id);
    set({ pendingDeletes: next });
  }
},
```

Import `deleteFile` from `../../api` at the top of the store file.

- [ ] **Step 2: Add context menu to FileCard in FileGrid**

In `packages/web/src/components/human-view/FileGrid.tsx`:
- Import `ContextMenu` from `../shared/ContextMenu`
- Import `useVisualizationStore` and `useToast`
- Add state for context menu position: `const [ctxMenu, setCtxMenu] = useState<{x:number, y:number, fileId:string, fileName:string} | null>(null)`
- On FileCard, add `onContextMenu` handler that sets `ctxMenu`
- Render `<ContextMenu>` when `ctxMenu` is set, with items:
  - "Download" → triggers download (see step 3)
  - "Delete" → schedules delete with undo toast
- Filter `displayFiles` to exclude files in `pendingDeletes`

- [ ] **Step 3: Implement download helper**

Add a utility function at the top of `FileGrid.tsx` (or in a shared util):

```typescript
function downloadFile(fileId: string, fileName: string) {
  const a = document.createElement("a");
  a.href = `/api/files/${encodeURIComponent(fileId)}/content`;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
```

- [ ] **Step 4: Add download button to FilePreview**

In `packages/web/src/components/human-view/FilePreview.tsx`:
- Add a download button in the header (next to the close button)
- Style: same as `closeStyle` but with "↓" text
- onClick: call `downloadFile(fileId, file.original_name)`

- [ ] **Step 5: Verify build + manual test**

Run: `cd packages/web && npx tsc --noEmit`

Manual test:
- Right-click file card → "Download" downloads the file
- Right-click file card → "Delete" → file disappears → toast with "Undo" → click Undo → file reappears
- Wait 8s without undo → file is permanently deleted (re-fetch shows it gone)

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/agent-view/useVisualizationStore.ts \
  packages/web/src/components/human-view/FileGrid.tsx \
  packages/web/src/components/human-view/FilePreview.tsx
git commit -m "feat(web): add file delete with undo toast and download functionality"
```

---

## Task 7: Metadata Editing

**Files:**
- Create: `packages/web/src/components/shared/InlineEdit.tsx`
- Create: `packages/web/src/components/shared/TagEditor.tsx`
- Create: `packages/web/src/components/shared/DigestModal.tsx`
- Modify: `packages/web/src/components/human-view/FilePreview.tsx`

- [ ] **Step 1: Create InlineEdit component**

Create `packages/web/src/components/shared/InlineEdit.tsx`:

```tsx
import { useState, useRef, useEffect } from "react";
import { MAP_THEME } from "../../theme";

interface InlineEditProps {
  value: string;
  placeholder?: string;
  onSave: (value: string) => void;
  multiline?: boolean;
}

export function InlineEdit({ value, placeholder, onSave, multiline }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [editing]);

  function handleSave() {
    const trimmed = draft.trim();
    if (trimmed !== value) onSave(trimmed);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        style={{
          cursor: "pointer",
          color: value ? MAP_THEME.text : MAP_THEME.textMuted,
          fontSize: 12,
          lineHeight: 1.6,
          opacity: value ? 0.7 : 0.4,
          fontStyle: value ? "normal" : "italic",
        }}
      >
        {value || placeholder || "Click to edit..."}
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        e.target.style.height = "auto";
        e.target.style.height = e.target.scrollHeight + "px";
      }}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSave();
      }}
      style={{
        width: "100%",
        background: "rgba(255,255,255,0.05)",
        border: `1px solid ${MAP_THEME.accentPrimary}`,
        borderRadius: 4,
        color: MAP_THEME.text,
        fontSize: 12,
        lineHeight: 1.6,
        padding: "4px 8px",
        resize: "none",
        overflow: "hidden",
        fontFamily: "inherit",
        outline: "none",
      }}
      rows={1}
    />
  );
}
```

- [ ] **Step 2: Create TagEditor component**

Create `packages/web/src/components/shared/TagEditor.tsx`:

```tsx
import { useState, useRef } from "react";
import { MAP_THEME } from "../../theme";

interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagEditor({ tags, onChange }: TagEditorProps) {
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isPotTag = (tag: string) => tag.startsWith("pot:");

  function handleAdd() {
    const trimmed = newTag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setNewTag("");
    setAdding(false);
  }

  function handleRemove(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      {tags.map((tag) => (
        <span
          key={tag}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 11,
            background: isPotTag(tag)
              ? "rgba(123, 211, 137, 0.15)"
              : "rgba(255,255,255,0.06)",
            color: isPotTag(tag) ? MAP_THEME.accentSecondary : MAP_THEME.text,
            border: `1px solid ${isPotTag(tag) ? "rgba(123,211,137,0.3)" : "rgba(255,255,255,0.1)"}`,
          }}
        >
          {tag}
          {!isPotTag(tag) && (
            <button
              onClick={() => handleRemove(tag)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: MAP_THEME.textMuted, fontSize: 14, padding: 0, lineHeight: 1,
              }}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {adding ? (
        <input
          ref={inputRef}
          autoFocus
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
            if (e.key === "Escape") { setNewTag(""); setAdding(false); }
          }}
          onBlur={handleAdd}
          placeholder="tag name"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${MAP_THEME.accentPrimary}`,
            borderRadius: 4,
            color: MAP_THEME.text,
            fontSize: 11,
            padding: "2px 8px",
            outline: "none",
            width: 80,
            fontFamily: "inherit",
          }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px dashed rgba(255,255,255,0.15)",
            borderRadius: 4,
            color: MAP_THEME.textMuted,
            fontSize: 11,
            padding: "2px 8px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          + tag
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create DigestModal component**

Create `packages/web/src/components/shared/DigestModal.tsx`:

```tsx
import { useState, useEffect } from "react";
import { MAP_THEME, Z_INDEX } from "../../theme";

interface DigestModalProps {
  value: string;
  onSave: (value: string) => void;
  onClose: () => void;
}

export function DigestModal({ value, onSave, onClose }: DigestModalProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: Z_INDEX.modal,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: MAP_THEME.panel,
          border: `1px solid ${MAP_THEME.border}`,
          borderRadius: 12,
          width: 600,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${MAP_THEME.border}`,
          fontWeight: 600,
          fontSize: 14,
          color: MAP_THEME.text,
        }}>
          Edit Digest
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          style={{
            flex: 1,
            minHeight: 200,
            margin: 16,
            padding: 12,
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${MAP_THEME.border}`,
            borderRadius: 8,
            color: MAP_THEME.text,
            fontSize: 13,
            lineHeight: 1.6,
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            resize: "vertical",
            outline: "none",
          }}
          placeholder="Write markdown digest..."
        />
        <div style={{
          padding: "12px 16px",
          borderTop: `1px solid ${MAP_THEME.border}`,
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "6px 16px", borderRadius: 6, border: `1px solid ${MAP_THEME.border}`,
              background: "transparent", color: MAP_THEME.text, cursor: "pointer",
              fontSize: 13, fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave(draft); onClose(); }}
            style={{
              padding: "6px 16px", borderRadius: 6, border: "none",
              background: MAP_THEME.accentPrimary, color: MAP_THEME.background,
              cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Integrate into FilePreview**

In `packages/web/src/components/human-view/FilePreview.tsx`:
- Import `TagEditor`, `InlineEdit`, `DigestModal`, `useToast`
- Import `getFileTags`, `updateFile` from api
- Fetch tags on file load: `getFileTags(fileId).then(res => setTags(res.tags))`
- Add below metadata section:
  - `<TagEditor tags={tags} onChange={handleTagChange} />`
  - `<InlineEdit value={file.tldr ?? ""} placeholder="Add a summary..." onSave={handleTldrSave} />`
  - Button: "Edit digest" / "Add digest" → opens `<DigestModal>`
- `handleTagChange`: calls `updateFile(id, { tags })`, shows toast
- `handleTldrSave`: calls `updateFile(id, { tldr })`, shows toast
- Digest save: calls `updateFile(id, { digest })`, shows toast

- [ ] **Step 5: Verify build + manual test**

Run: `cd packages/web && npx tsc --noEmit`

Manual test:
- Click file → preview panel → see tags → add/remove tag → verify save
- Click summary text → inline edit → blur → saved
- Click "Edit digest" → modal → type → Save → toast

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/shared/InlineEdit.tsx \
  packages/web/src/components/shared/TagEditor.tsx \
  packages/web/src/components/shared/DigestModal.tsx \
  packages/web/src/components/human-view/FilePreview.tsx
git commit -m "feat(web): add inline metadata editing with tags, tldr, and digest modal"
```

---

## Task 8: Pots Sidebar in Files View & Pot File Management

**Files:**
- Create: `packages/web/src/components/human-view/PotsSidebar.tsx`
- Create: `packages/web/src/components/shared/FileSearchPicker.tsx`
- Modify: `packages/web/src/components/human-view/TaxonomyBrowser.tsx`
- Modify: `packages/web/src/components/agent-view/useVisualizationStore.ts`

- [ ] **Step 1: Add Files-view pot state to store**

In `packages/web/src/components/agent-view/useVisualizationStore.ts`:
- Add `selectedPotSlugForFilesView: string | null` to state
- Add action `selectPotForFilesView(slug: string | null)`: sets `selectedPotSlugForFilesView`
- When set, Files view uses `listPotFiles(slug)` instead of `listFiles()`

- [ ] **Step 2: Create FileSearchPicker component**

Create `packages/web/src/components/shared/FileSearchPicker.tsx`:

```tsx
import { useState, useEffect, useRef } from "react";
import { searchFiles } from "../../api";
import { MAP_THEME, Z_INDEX } from "../../theme";
import type { SearchResult } from "../../types";

interface FileSearchPickerProps {
  onSelect: (fileId: string) => void;
  excludeIds?: Set<string>;
  onClose: () => void;
}

export function FileSearchPicker({ onSelect, excludeIds, onClose }: FileSearchPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timeout = window.setTimeout(async () => {
      try {
        const res = await searchFiles(query);
        setResults(res.results ?? []);
      } catch { setResults([]); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: "100%",
        top: 0,
        marginLeft: 4,
        width: 280,
        zIndex: Z_INDEX.contextMenu,
        background: MAP_THEME.panel,
        border: `1px solid ${MAP_THEME.border}`,
        borderRadius: 8,
        padding: 8,
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search files to add..."
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.05)",
          border: `1px solid ${MAP_THEME.border}`,
          borderRadius: 4,
          color: MAP_THEME.text,
          fontSize: 12,
          padding: "6px 8px",
          outline: "none",
          fontFamily: "inherit",
          boxSizing: "border-box",
        }}
      />
      <div style={{ maxHeight: 240, overflowY: "auto", marginTop: 4 }}>
        {results.map((r) => {
          const inPot = excludeIds?.has(r.id);
          return (
            <button
              key={r.id}
              onClick={() => !inPot && onSelect(r.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "6px 8px",
                border: "none",
                background: "transparent",
                color: inPot ? MAP_THEME.textMuted : MAP_THEME.text,
                fontSize: 12,
                cursor: inPot ? "default" : "pointer",
                textAlign: "left",
                opacity: inPot ? 0.5 : 1,
                fontFamily: "inherit",
                borderRadius: 4,
              }}
              onMouseEnter={(e) => { if (!inPot) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.filePath?.split("/").pop() ?? r.id}
              </span>
              {inPot && <span style={{ fontSize: 10 }}>✓</span>}
            </button>
          );
        })}
        {query && results.length === 0 && (
          <div style={{ padding: 8, fontSize: 11, opacity: 0.4, textAlign: "center" }}>
            No results
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create PotsSidebar for Files view**

Create `packages/web/src/components/human-view/PotsSidebar.tsx`:

A compact pots list component for the Files view sidebar. Contains:
- List of pot names with file counts
- "+" button to create new pot
- Right-click context menu (rename, delete) — uses shared `ContextMenu`
- Click to select pot → sets `selectedPotSlugForFilesView` in store
- "Add files" button when pot is selected → opens `FileSearchPicker`
- Per-pot upload "+" icon
- Share button on hover (implemented in Task 9)

Key difference from agent-view PotsSidebar: this is a compact section, not a full sidebar panel. Renders as a collapsible section above the taxonomy tree.

- [ ] **Step 4: Integrate into TaxonomyBrowser**

In `packages/web/src/components/human-view/TaxonomyBrowser.tsx`:
- Import new `PotsSidebar` and `useVisualizationStore`
- Read `selectedPotSlugForFilesView` from store
- Restructure the sidebar: pots section on top, taxonomy tree below
- When pot is selected: clear `selectedPath`, pass pot slug to FileGrid
- When taxonomy path is selected: clear pot selection
- FileGrid needs a new optional prop: `potSlug?: string`. When set, it fetches files via `listPotFiles(potSlug)` instead of `listFiles()`.

Updated sidebar layout:
```tsx
<div style={{ width: 240, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,0.1)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
  <PotsSidebar
    onSelectPot={(slug) => { setSelectedPotSlug(slug); setSelectedPath([]); }}
    selectedSlug={selectedPotSlug}
  />
  <div style={{ flex: 1, overflowY: "auto", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
    <TaxonomySidebar
      selectedPath={selectedPath}
      onSelect={(path) => { setSelectedPath(path); setSelectedPotSlug(null); }}
    />
  </div>
</div>
```

- [ ] **Step 5: Update FileGrid to support pot filtering**

In `packages/web/src/components/human-view/FileGrid.tsx`:
- Add optional `potSlug?: string` prop to `FileGridProps`
- When `potSlug` is set, fetch via `listPotFiles(potSlug)` instead of pagination loop
- When pot changes, re-fetch files

- [ ] **Step 6: Verify build + manual test**

Run: `cd packages/web && npx tsc --noEmit`

Manual test:
- Files view sidebar shows pots section above taxonomy tree
- Click pot → file grid filters to pot's files, taxonomy deselects
- Click taxonomy node → pot deselects
- Click "Add files" on selected pot → search picker → add file → pot tag added
- Right-click pot → Rename/Delete work

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/human-view/PotsSidebar.tsx \
  packages/web/src/components/shared/FileSearchPicker.tsx \
  packages/web/src/components/human-view/TaxonomyBrowser.tsx \
  packages/web/src/components/human-view/FileGrid.tsx \
  packages/web/src/components/agent-view/useVisualizationStore.ts
git commit -m "feat(web): add pots sidebar to Files view with file management"
```

---

## Task 9: Sharing UI + Backend Endpoint

**Files:**
- Modify: `packages/core/src/shares.ts`
- Modify: `packages/server/src/routes/pots.ts` (or shares.ts)
- Create: `packages/web/src/components/shared/SharePopover.tsx`
- Create: `packages/web/src/components/shared/ShareInbox.tsx`
- Modify: `packages/web/src/components/TopBar.tsx`
- Modify: `packages/web/src/components/agent-view/PotsSidebar.tsx`

- [ ] **Step 1: Add listPotShares to core**

In `packages/core/src/shares.ts`, add:

```typescript
export async function listPotShares(
  potRef: string,
  opts: { wsPath: string },
): Promise<PotShare[]> {
  const pot = await getPot(potRef, opts);
  if (!pot) return [];
  const all = await listShares(opts);
  return all.filter((s) => s.pot_id === pot.id);
}
```

Export it from the package's public API (check `packages/core/src/index.ts` or barrel export).

- [ ] **Step 2: Add server endpoint**

In the pots or shares router file, add:

```typescript
// GET /api/pots/:pot/shares
router.get("/:pot/shares", async (req, res, next) => {
  try {
    const items = await listPotShares(req.params.pot, { wsPath });
    res.json({ items, total: items.length });
  } catch (err) { next(err); }
});
```

Make sure to import `listPotShares` from `@clawdrive/core`.

- [ ] **Step 3: Create SharePopover component**

Create `packages/web/src/components/shared/SharePopover.tsx`:

```tsx
import { useState, useEffect, useRef } from "react";
import { createShare, listPotShares, revokeShare } from "../../api";
import { useToast } from "./Toast";
import { MAP_THEME, Z_INDEX } from "../../theme";
import type { PotShare } from "../../types";

interface SharePopoverProps {
  potSlug: string;
  onClose: () => void;
  anchorX: number;
  anchorY: number;
}

export function SharePopover({ potSlug, onClose, anchorX, anchorY }: SharePopoverProps) {
  const [shares, setShares] = useState<PotShare[]>([]);
  const [loading, setLoading] = useState(true);
  const { show } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listPotShares(potSlug)
      .then((res) => setShares(res.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [potSlug]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  async function handleCreateLink() {
    try {
      await createShare(potSlug, { kind: "link", role: "read" });
      show("Share link created (pending approval)", { type: "success" });
      const res = await listPotShares(potSlug);
      setShares(res.items ?? []);
    } catch {
      show("Failed to create share", { type: "error" });
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeShare(id);
      show("Share revoked", { type: "success" });
      setShares((prev) => prev.map((s) => (s.id === id ? { ...s, status: "revoked" as const } : s)));
    } catch {
      show("Failed to revoke", { type: "error" });
    }
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/s/${token}`);
    show("Link copied", { type: "success" });
  }

  const STATUS_COLORS: Record<string, string> = {
    active: MAP_THEME.accentSecondary,
    pending: MAP_THEME.accentWarm,
    revoked: "#ff8d8d",
    expired: MAP_THEME.textMuted,
  };

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: anchorX,
        top: anchorY,
        zIndex: Z_INDEX.contextMenu,
        background: MAP_THEME.panel,
        border: `1px solid ${MAP_THEME.border}`,
        borderRadius: 8,
        padding: 12,
        width: 260,
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: MAP_THEME.text, marginBottom: 8 }}>
        Share Pot
      </div>

      <button
        onClick={handleCreateLink}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 6,
          border: `1px solid ${MAP_THEME.border}`,
          background: "rgba(255,255,255,0.04)",
          color: MAP_THEME.accentPrimary,
          fontSize: 12,
          cursor: "pointer",
          fontFamily: "inherit",
          marginBottom: 8,
        }}
      >
        Create public link
      </button>

      {loading ? (
        <div style={{ fontSize: 11, opacity: 0.4, textAlign: "center", padding: 8 }}>Loading...</div>
      ) : shares.length === 0 ? (
        <div style={{ fontSize: 11, opacity: 0.4, textAlign: "center", padding: 8 }}>No shares yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {shares.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 0",
                fontSize: 11,
                color: MAP_THEME.text,
              }}
            >
              <span
                style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: STATUS_COLORS[s.status] ?? MAP_THEME.textMuted,
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1 }}>{s.kind === "link" ? "Link" : s.principal}</span>
              <span style={{ opacity: 0.5, fontSize: 10 }}>{s.status}</span>
              {s.status === "active" && s.token && (
                <button
                  onClick={() => copyLink(s.token!)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: MAP_THEME.accentPrimary, fontSize: 10, padding: 0,
                  }}
                >
                  Copy
                </button>
              )}
              {(s.status === "active" || s.status === "pending") && (
                <button
                  onClick={() => handleRevoke(s.id)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "#ff8d8d", fontSize: 10, padding: 0,
                  }}
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create ShareInbox component**

Create `packages/web/src/components/shared/ShareInbox.tsx`:

```tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { listShareInbox, approveShare, revokeShare } from "../../api";
import { useToast } from "./Toast";
import { MAP_THEME, Z_INDEX } from "../../theme";
import type { PotShare } from "../../types";

export function ShareInbox() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PotShare[]>([]);
  const { show } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await listShareInbox();
      setItems(res.items ?? []);
    } catch {}
  }, []);

  // Poll on focus + interval, pause when hidden
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    function handleVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleApprove(id: string) {
    try {
      await approveShare(id);
      show("Share approved", { type: "success" });
      refresh();
    } catch { show("Failed to approve", { type: "error" }); }
  }

  async function handleReject(id: string) {
    try {
      await revokeShare(id);
      show("Share rejected", { type: "info" });
      refresh();
    } catch { show("Failed to reject", { type: "error" }); }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: MAP_THEME.text, fontSize: 14, padding: "4px 8px",
          position: "relative",
        }}
        title="Share inbox"
      >
        🔗
        {items.length > 0 && (
          <span style={{
            position: "absolute", top: -2, right: -2,
            background: MAP_THEME.accentWarm,
            color: MAP_THEME.background,
            fontSize: 9, fontWeight: 700,
            width: 16, height: 16, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <div style={{
          position: "absolute",
          right: 0,
          top: "100%",
          marginTop: 4,
          width: 280,
          zIndex: Z_INDEX.contextMenu,
          background: MAP_THEME.panel,
          border: `1px solid ${MAP_THEME.border}`,
          borderRadius: 8,
          padding: 12,
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MAP_THEME.text, marginBottom: 8 }}>
            Pending Shares
          </div>
          {items.length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.4, textAlign: "center", padding: 12 }}>
              No pending shares
            </div>
          ) : (
            items.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
                  fontSize: 12, color: MAP_THEME.text,
                }}
              >
                <span style={{ flex: 1 }}>
                  {s.pot_slug}
                  <span style={{ opacity: 0.4, marginLeft: 6, fontSize: 10 }}>
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </span>
                <button
                  onClick={() => handleApprove(s.id)}
                  style={{
                    background: "rgba(123,211,137,0.15)", border: "none", borderRadius: 4,
                    color: MAP_THEME.accentSecondary, fontSize: 11, padding: "2px 8px",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(s.id)}
                  style={{
                    background: "rgba(255,141,141,0.15)", border: "none", borderRadius: 4,
                    color: "#ff8d8d", fontSize: 11, padding: "2px 8px",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Reject
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add share button to PotsSidebar (agent-view)**

In `packages/web/src/components/agent-view/PotsSidebar.tsx`:
- Add share icon button on each pot (visible on hover or always for selected)
- On click: opens `SharePopover` with the pot's slug and button position

- [ ] **Step 6: Add ShareInbox to TopBar**

In `packages/web/src/components/TopBar.tsx`:
- Import `ShareInbox`
- Add it in the right section, between the upload button and ViewTabs

- [ ] **Step 7: Verify build + manual test**

Run: `cd packages/web && npx tsc --noEmit && cd ../server && npx tsc --noEmit && cd ../core && npx tsc --noEmit`

Manual test:
- Click share button on pot → popover → "Create public link" → toast
- Share inbox icon shows in top bar
- If pending shares exist, badge shows count
- Approve/Reject buttons work

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/shares.ts \
  packages/server/src/routes/pots.ts \
  packages/web/src/components/shared/SharePopover.tsx \
  packages/web/src/components/shared/ShareInbox.tsx \
  packages/web/src/components/TopBar.tsx \
  packages/web/src/components/agent-view/PotsSidebar.tsx
git commit -m "feat: add sharing UI with quick share popover and inbox management"
```

---

## Task 10: Advanced Search Filters + Backend Support

**Files:**
- Modify: `packages/core/src/manage.ts`
- Modify: `packages/server/src/routes/files.ts`
- Create: `packages/web/src/components/shared/SearchFilters.tsx`
- Modify: `packages/web/src/components/InlineSearch.tsx`
- Modify: `packages/web/src/api.ts`

- [ ] **Step 1: Add type/tags filtering to core listFiles**

In `packages/core/src/manage.ts`, in the `listFiles` function, add filtering support. After the existing `taxonomyPath` filter, add:

```typescript
// In listFiles function, extend the input type:
// input: { limit?, cursor?, taxonomyPath?, contentType?, tags? }

// After fetching items, apply filters:
if (input.contentType) {
  items = items.filter((f) => f.content_type.startsWith(input.contentType!));
}
if (input.tags && input.tags.length > 0) {
  items = items.filter((f) => input.tags!.every((t) => f.tags.includes(t)));
}
```

Update the `ListFilesInput` type (or the inline parameter type) to include `contentType?: string` and `tags?: string[]`.

- [ ] **Step 2: Add query params to server files route**

In `packages/server/src/routes/files.ts`, in the `GET /api/files` handler, parse additional query params:

```typescript
const contentType = req.query.type as string | undefined;
const tagsParam = req.query.tags as string | undefined;
const tags = tagsParam ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
```

Pass these to `listFiles()`:

```typescript
const result = await listFilesForRoute({
  limit, cursor, taxonomyPath, contentType, tags,
}, { wsPath });
```

Update `listFilesForRoute` to forward these params to `listFiles()`.

- [ ] **Step 3: Update searchFiles in api.ts**

In `packages/web/src/api.ts`, update `searchFiles` signature:

```typescript
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
```

- [ ] **Step 4: Create SearchFilters component**

Create `packages/web/src/components/shared/SearchFilters.tsx`:

```tsx
import { useState, useEffect } from "react";
import { listPots } from "../../api";
import { MAP_THEME, MODALITY_COLORS } from "../../theme";
import type { PotRecord } from "../../types";

export interface SearchFilterState {
  types: string[];
  pot: string | null;
  tags: string[];
}

interface SearchFiltersProps {
  value: SearchFilterState;
  onChange: (filters: SearchFilterState) => void;
}

const TYPE_OPTIONS = [
  { label: "PDF", value: "application/pdf", color: MODALITY_COLORS.pdf },
  { label: "Image", value: "image/", color: MODALITY_COLORS.image },
  { label: "Video", value: "video/", color: MODALITY_COLORS.video },
  { label: "Audio", value: "audio/", color: MODALITY_COLORS.audio },
  { label: "Text", value: "text/", color: MODALITY_COLORS.text },
];

export function SearchFilters({ value, onChange }: SearchFiltersProps) {
  const [pots, setPots] = useState<PotRecord[]>([]);

  useEffect(() => {
    listPots().then((res) => setPots(res.pots ?? [])).catch(() => {});
  }, []);

  function toggleType(type: string) {
    const next = value.types.includes(type)
      ? value.types.filter((t) => t !== type)
      : [...value.types, type];
    onChange({ ...value, types: next });
  }

  function setPot(slug: string | null) {
    onChange({ ...value, pot: slug });
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "4px 0" }}>
      {TYPE_OPTIONS.map((opt) => {
        const active = value.types.includes(opt.value);
        return (
          <button
            key={opt.value}
            onClick={() => toggleType(opt.value)}
            style={{
              padding: "2px 8px",
              borderRadius: 4,
              border: `1px solid ${active ? opt.color : "rgba(255,255,255,0.1)"}`,
              background: active ? `${opt.color}20` : "transparent",
              color: active ? opt.color : MAP_THEME.textMuted,
              fontSize: 10,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {opt.label}
          </button>
        );
      })}
      {pots.length > 0 && (
        <select
          value={value.pot ?? ""}
          onChange={(e) => setPot(e.target.value || null)}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${MAP_THEME.border}`,
            borderRadius: 4,
            color: MAP_THEME.text,
            fontSize: 10,
            padding: "2px 6px",
            outline: "none",
            fontFamily: "inherit",
          }}
        >
          <option value="">All pots</option>
          {pots.map((p) => (
            <option key={p.id} value={p.slug}>{p.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

export const EMPTY_FILTERS: SearchFilterState = { types: [], pot: null, tags: [] };
```

- [ ] **Step 5: Integrate SearchFilters into InlineSearch**

In `packages/web/src/components/InlineSearch.tsx`:
- Import `SearchFilters`, `SearchFilterState`, `EMPTY_FILTERS`
- Add state: `const [filters, setFilters] = useState<SearchFilterState>(EMPTY_FILTERS)`
- Show `<SearchFilters>` row below the search input when the dropdown is open
- Pass filters to `searchFiles()` call:
  - `type`: join types with comma, or undefined
  - `pot`: filter pot slug or undefined
  - `tags`: join tags with comma, or undefined
- Active filters shown as removable chips in the input area
- When filters are set but no query text: use `listFiles` with type/tags params as fallback (the backend now supports this from Steps 1-2)

- [ ] **Step 6: Verify build + manual test**

Run: `cd packages/web && npx tsc --noEmit && cd ../server && npx tsc --noEmit && cd ../core && npx tsc --noEmit`

Run tests: `cd packages/core && npx vitest run`

Manual test:
- Open search (Cmd+K) → filter row appears
- Click "PDF" → only PDF results
- Select pot → filtered by pot
- Combine filters → intersection
- Clear filters → all results

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/manage.ts \
  packages/server/src/routes/files.ts \
  packages/web/src/api.ts \
  packages/web/src/components/shared/SearchFilters.tsx \
  packages/web/src/components/InlineSearch.tsx
git commit -m "feat: add advanced search filters with type, pot, and tags support"
```

---

## Task 11: Space View Integration

**Files:**
- Modify: `packages/web/src/components/agent-view/ExpandablePreview.tsx`

- [ ] **Step 1: Add inline metadata editing to ExpandablePreview**

In `packages/web/src/components/agent-view/ExpandablePreview.tsx`:
- Import `TagEditor`, `InlineEdit`, `DigestModal` from shared components
- Import `getFileTags`, `updateFile` from api
- Import `useToast`
- Add tags fetch when file is selected
- Below the existing preview content, add:
  - `<TagEditor>` for tags
  - `<InlineEdit>` for tldr
  - "Edit digest" button → `<DigestModal>`
- Wire up save handlers same as FilePreview (Task 7, Step 4)

- [ ] **Step 2: Add context menu to 3D points**

This is handled via existing click/hover mechanics in the Space view. Add right-click handling to `PointCloud.tsx` or `EmbeddingSpace.tsx`:
- On right-click a point: show `<ContextMenu>` with "Download" and "Delete"
- Reuse the `downloadFile` helper and `scheduleDelete` from store

- [ ] **Step 3: Verify build + manual test**

Run: `cd packages/web && npx tsc --noEmit`

Manual test:
- In Space view, click a point → expanded preview → edit tags, tldr, digest
- Right-click a point → context menu with Download/Delete

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/agent-view/ExpandablePreview.tsx \
  packages/web/src/components/agent-view/EmbeddingSpace.tsx
git commit -m "feat(web): add metadata editing and context menu to Space view"
```

---

## Verification Checklist

After all tasks are complete, verify end-to-end:

- [ ] `npx turbo build` — full monorepo build succeeds
- [ ] `npx vitest run` — all existing tests pass
- [ ] Start dev server: `cd packages/cli && node dist/index.js serve --open`
- [ ] **Files view:**
  - [ ] Upload via button, drag-drop, and per-pot
  - [ ] Right-click file → Download, Delete (with undo)
  - [ ] Click file → preview → edit tags, tldr, digest
  - [ ] Pots section in sidebar → select pot → filtered grid
  - [ ] Taxonomy and pot selection are mutually exclusive
  - [ ] Share button on pot → create link, copy, revoke
  - [ ] Search with type/pot filters
- [ ] **Space view:**
  - [ ] Pot sidebar upload and share work
  - [ ] Right-click point → Download, Delete
  - [ ] Expanded preview → edit tags, tldr, digest
- [ ] **Top bar:**
  - [ ] Upload button works
  - [ ] Share inbox icon shows badge for pending shares
