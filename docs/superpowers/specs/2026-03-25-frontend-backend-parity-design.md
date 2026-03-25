# Frontend-Backend Parity & UX Improvements

**Date:** 2026-03-25
**Status:** Draft
**Scope:** Close functionality gaps between frontend and backend, improve pot/file management UX

## Problem

The frontend is missing several backend capabilities — file upload, delete, download, metadata editing, sharing, and advanced search filters. Pot management is limited to assignment from a modal, which is not user-friendly. The Files view lacks the tools to be a proper file management surface.

## Design Decisions

- **Files view is the primary management surface** — full CRUD, sharing, metadata editing
- **Space view stays exploration-focused** — lightweight actions only (context menu, pot sidebar, expanded preview with inline edit)
- **Approach: light infrastructure + feature slices** — build shared primitives (toast, context menu, drop zone) first, then vertical feature slices
- **Pots sidebar in Files view** — stacked layout (pots on top, taxonomy below)
- **Undo over confirmation** — delete uses immediate removal + undo toast (Gmail pattern)
- **Inline editing for short fields, modal for long** — tags/tldr inline, digest in modal

## Implementation Order

1. Shared infrastructure (toast, context menu, drop zone)
2. File upload (global + per-pot)
3. File delete + download
4. Metadata editing
5. Pot management improvements
6. Sharing UI
7. Advanced search filters

---

## Section 0: State Management Strategy

**Toast system:** React Context (`<ToastProvider>` + `useToast()` hook). Lightweight, no external state needed.

**Upload queue:** A `useUploadQueue` hook using local state with `useRef` for the pending queue. Manages concurrency (max 3), progress tracking, and abort on unmount. Not a Zustand store — upload state is transient and view-local.

**Files view state:** The existing `useVisualizationStore` (Zustand) already manages pots and file interaction. Extend it with:
- `selectedPotSlugForFilesView: string | null` — pot filter for Files view
- `pendingDeletes: Map<string, { timer: ReturnType<typeof setTimeout>, file: FileInfo }>` — deferred delete tracking (use `window.setTimeout` to ensure browser return type if `@types/node` is in scope)

**Pending delete lifecycle:**
- On delete action: remove file from local display state, start 8s timer, store file data in `pendingDeletes`
- On undo: cancel timer, restore file to display state, remove from `pendingDeletes`
- On timer expiry: fire `DELETE /api/files/:id`, remove from `pendingDeletes`, re-fetch list
- On component unmount: cancel all pending timers (files survive — delete was never sent)
- On page refresh: same — pending deletes are lost, files survive

This is safe because the backend `DELETE` is a soft-delete (sets `deleted_at` timestamp). Files are only permanently removed by the separate `gc` command.

---

## Section 1: Shared Infrastructure

### 1.1 Toast Notification System

A `<ToastProvider>` at the app root renders toasts in the bottom-right corner.

**Hook:** `useToast()` returns `{ show(message, options) }`

**Options:**
- `type`: `success` | `error` | `info`
- `duration`: auto-dismiss time (default 4s, 8s when undo action present)
- `action`: optional `{ label: string, onClick: () => void }` for undo button

**Behavior:**
- Stacks up to 3 toasts, oldest dismissed first
- Styled with `MAP_THEME.panel` background, border color varies by type
- Undo action button styled with `MAP_THEME.accentPrimary`

### 1.2 Context Menu

A `<ContextMenu>` component triggered by right-click or three-dot button.

**Props:**
- `items`: `Array<{ label: string, icon?: ReactNode, onClick: () => void, danger?: boolean }>`
- `trigger`: the element that opens the menu

**Behavior:**
- Positioned relative to trigger point (mouse position for right-click, below button for three-dot)
- Dismisses on click-outside or Escape
- Danger items rendered in red
- Z-index: `Z_INDEX.contextMenu` (1000)

**Reused by:** file cards, pot sidebar items, Space view points

**Note:** `PotsSidebar.tsx` already contains an inline context menu implementation. Extract and generalize it into this shared component.

### 1.3 Drop Zone

A `<DropZone>` component wrapping any area.

**Props:**
- `onDrop: (files: File[]) => void`
- `disabled?: boolean`
- `label?: string` (default "Drop files here")

**Behavior:**
- Shows overlay with dashed border + label on drag-over
- Nested drop zones: innermost (pot-level) takes priority over outer (global)
- Supports click-to-browse fallback via hidden `<input type="file" multiple>`
- Overlay styled with semi-transparent `MAP_THEME.panel` background

---

## Section 2: File Upload

### 2.1 API Addition

```typescript
// api.ts
export async function uploadFile(
  file: File,
  opts?: { tags?: string[]; potSlug?: string }
): Promise<{ id: string; fileHash: string; status: "stored" | "duplicate"; duplicateId?: string; chunks: number; tokensUsed: number }>
```

- Uses `FormData` with `multipart/form-data` to `POST /api/files/store`
- If `potSlug` provided, client-side appends `pot:<slug>` to the tags array before sending in FormData (not a separate form field)

### 2.2 Global Upload (Files View)

- Entire Files view content area wrapped in `<DropZone>`
- Drag files onto the page: overlay appears, drop to upload
- Upload button in the top bar (cloud-upload icon): opens file picker
- Multiple file support: uploads run in parallel (max 3 concurrent)
- Progress: toast shows "Uploading N files..." then "N files uploaded" on completion
- Error: toast with error message per failed file

### 2.3 Per-Pot Upload (Both Views)

- Each pot in the sidebar gets a small "+" icon button
- Click: file picker opens, uploaded files auto-tagged to that pot
- Pot sidebar items also act as drop targets: drag files onto a pot name
- Visual feedback: pot item highlights with `MAP_THEME.accentPrimary` border on drag-over

### 2.4 Post-Upload

- File list auto-refreshes (re-fetch current view)
- In Space view: projections recompute after upload (`POST /api/projections/recompute`)
- Toast: "filename.pdf uploaded" on success
- **Duplicate handling:** When `status === "duplicate"`, show toast: "filename.pdf already exists" (info type, not error). Do not show it as a failure — the file is accessible via the existing record.

---

## Section 3: File Delete & Download

### 3.1 Delete

**API Addition:**
```typescript
// api.ts
export async function deleteFile(id: string): Promise<void>
```
Calls `DELETE /api/files/:id` (soft-delete).

**In Files View:**
- Right-click file card: context menu with "Delete" (red, danger item)
- Immediate removal from UI
- Undo toast: "file.pdf deleted" + "Undo" button (8s window)
- Implementation: remove from local state immediately, delay API call until toast expires. Undo restores local state and cancels the API call.
- File list re-fetches after toast expires

**In Space View:**
- Right-click a point: context menu with "Delete" (same undo behavior)

### 3.2 Download

**In Files View:**
- Right-click file card: context menu with "Download"
- Download icon button in the file preview side panel
- Implementation: create temporary `<a>` element with `href=fileContentUrl(id)` and `download` attribute, click programmatically

**In Space View:**
- Right-click point: context menu with "Download"
- Download button in expanded preview modal

**Backend consideration:** May need `?download=1` query param support to set `Content-Disposition: attachment` header. If not supported, the `<a download>` attribute handles it for same-origin requests.

---

## Section 4: Metadata Editing

### 4.1 Inline Tag Editing (Preview Panel)

- Tags displayed as chips below file preview
- Each chip has an "x" button to remove
- "+" chip at the end: opens small text input, Enter to add tag
- Tags starting with `pot:` styled with `MAP_THEME.accentSecondary`, not removable here (managed via pot assignment)
- On change: calls existing `updateFile(id, { tags })` (already in `api.ts`), success toast
- **Prerequisite:** The `FileInfo` type in `packages/web/src/types.ts` must be extended with `tags: string[]`. The backend's `toFileMetadataRecord` already includes tags in the response — only the frontend type is missing the field. Alternatively, fetch tags on-demand via `GET /api/files/:id/tags` when the preview panel opens. Decision: extend `FileInfo` with `tags` since multiple features need it (tag editing, pot chips, search filter display).

### 4.2 Inline TL;DR / Description (Preview Panel)

- Displayed as text below tags
- Click text: becomes inline `<textarea>` with auto-height
- Blur or Cmd+Enter saves: `updateFile(id, { tldr })`, subtle "Saved" toast
- Empty state: "Add a summary..." placeholder, clickable

### 4.3 Inline Abstract

- Same pattern as TL;DR

### 4.4 Digest Modal

- "Edit digest" button in preview panel (or "Add digest" if none exists)
- Opens modal with full-width markdown `<textarea>`
- Save / Cancel buttons at bottom
- Save: `updateFile(id, { digest })`, toast on success

### 4.5 Space View

- Expanded preview modal gets same inline editing for tags and tldr
- Digest editing via same modal button

---

## Section 5: Pot Management Improvements

### 5.1 Add Existing Files to Pot (Sidebar)

- When a pot is selected, sidebar shows member file list
- "Add files" button at top of member list
- Click: opens search/picker popover
  - Search input queries `GET /api/search?q=...`
  - Results show file name + type icon
  - Click result to add to pot (tags file with `pot:<slug>`)
  - Already-in-pot files shown dimmed/checked
  - Multiple files can be added without closing popover

### 5.2 Drag-to-Pot From File Grid

- In Files view: drag a file card onto a pot name in the sidebar
- Visual feedback: pot item highlights, cursor changes
- On drop: tags file with `pot:<slug>`

### 5.3 Remove File From Pot

- In pot's file list (sidebar): each file has an "x" button, or right-click: "Remove from pot"
- Removes `pot:<slug>` tag only, does not delete the file
- Undo toast: "file.pdf removed from PotName" + Undo

### 5.4 Pots Sidebar in Files View

- Stacked layout in left sidebar:
  - **Top section: Pots** — compact list of pot names with file counts, collapsible
  - **Bottom section: Taxonomy** — expandable tree (existing `TaxonomySidebar`)
- Selecting a pot filters the file grid to that pot's files (uses `GET /api/pots/:slug/files`)
- **Pot and taxonomy filters are mutually exclusive:** selecting a pot clears taxonomy selection and vice versa. The active filter is indicated visually (highlighted pot name or highlighted taxonomy node, never both).
- Pot CRUD (create, rename, delete) available via same interactions as Space view sidebar ("+", right-click context menu)
- Both sections independently scrollable

---

## Section 6: Sharing UI

### 6.1 Quick Share (Pot Sidebar)

- Share icon button on each pot (visible on hover, always visible for selected pot)
- Click: opens share popover with:
  - **"Create public link"** button: calls `POST /api/shares/pot/:pot` with `kind: "link", role: "read"`
  - **Active shares list**: existing shares for this pot with status chips (pending / active / expired / revoked). **Note:** No endpoint exists to list shares by pot — need to add `GET /api/shares?pot=:slug` or `GET /api/pots/:pot/shares` to the backend.
  - **Copy link** button on active link shares: copies `/s/:token` URL to clipboard, toast "Link copied"
  - **Revoke** button on active/pending shares: calls `POST /api/shares/:ref/revoke`, undo toast

### 6.2 Shares Inbox (Top Bar)

- Share/link icon in the top bar
- Badge with count when pending shares exist
- Click: dropdown popover showing pending shares
  - Each item: pot name, creation time
  - "Approve" button: `POST /api/shares/:ref/approve`, toast "Share approved"
  - "Reject" button: `POST /api/shares/:ref/revoke`, toast "Share rejected"
  - Empty state: "No pending shares"
- Refreshes on window focus and every 30s (pauses when tab is hidden via `visibilitychange`, clears interval on unmount)

### 6.3 API Additions

```typescript
// api.ts
export async function createShare(
  potSlug: string,
  opts: { kind: "link" | "principal"; role?: "read" | "write"; principal?: string }
): Promise<PotShare>

export async function listShareInbox(): Promise<{ items: PotShare[]; total: number }>

export async function approveShare(ref: string): Promise<PotShare>

export async function revokeShare(ref: string): Promise<PotShare>
```

---

## Section 7: Advanced Search Filters

### 7.1 Enhanced Search Bar (Cmd+K)

- Filter row below search input, visible when search is focused
- **Type filter**: dropdown with checkboxes (PDF, Image, Video, Audio, Text) maps to `type` param
- **Pot filter**: dropdown listing pots, maps to `pot` param
- **Tags filter**: text input with autocomplete from known tags, maps to `tags` param
- Active filters shown as removable chips below the search input
- All filters passed to `GET /api/search?q=...&type=...&tags=...&pot=...`
- **Filter-only mode (no query text):** The backend `GET /api/search` requires `q` param. When filters are set but no text query, fall back to `GET /api/files`. **Known limitation:** `GET /api/files` doesn't support `type` or `tags` filtering — client-side filtering on paginated results is unreliable for large datasets. **Backend change needed:** add optional `type` and `tags` query params to `GET /api/files` endpoint (simple WHERE clause additions in `listFiles`).

### 7.2 API Change

Update `searchFiles()` signature:
```typescript
export async function searchFiles(
  query: string,
  opts?: { type?: string; tags?: string; pot?: string; limit?: number; minScore?: number }
): Promise<SearchResponse>
```

---

## New Components Summary

| Component | Location | Used By |
|---|---|---|
| `ToastProvider` + `useToast` | `components/shared/Toast.tsx` | App root, all features |
| `ContextMenu` | `components/shared/ContextMenu.tsx` | File cards, pot items, Space points |
| `DropZone` | `components/shared/DropZone.tsx` | Files view, pot sidebar |
| `InlineEdit` | `components/shared/InlineEdit.tsx` | Metadata fields (tldr, abstract) |
| `TagEditor` | `components/shared/TagEditor.tsx` | Preview panels |
| `DigestModal` | `components/shared/DigestModal.tsx` | Preview panels |
| `FileSearchPicker` | `components/shared/FileSearchPicker.tsx` | Pot sidebar "Add files" |
| `SharePopover` | `components/shared/SharePopover.tsx` | Pot sidebar share button |
| `ShareInbox` | `components/shared/ShareInbox.tsx` | Top bar dropdown |
| `SearchFilters` | `components/shared/SearchFilters.tsx` | InlineSearch enhancement |

## API Additions Summary

| Function | Method | Endpoint |
|---|---|---|
| `uploadFile` | POST | `/api/files/store` |
| `deleteFile` | DELETE | `/api/files/:id` |
| `createShare` | POST | `/api/shares/pot/:pot` |
| `listShareInbox` | GET | `/api/shares/inbox` |
| `approveShare` | POST | `/api/shares/:ref/approve` |
| `revokeShare` | POST | `/api/shares/:ref/revoke` |
| `listPotShares` | GET | `/api/pots/:pot/shares` **(new)** |

### Backend Changes Needed

Two changes required:
- `GET /api/pots/:pot/shares` — list all shares for a specific pot (needed for Section 6.1 share popover). Returns `{ items: PotShare[], total: number }`. Requires a new `listPotShares(potRef)` function in `@clawdrive/core/shares.ts`.
- `GET /api/files` — add optional `type` and `tags` query params for filter-only search mode (Section 7.1).

### Existing API Functions (already in `api.ts`)

These functions already exist and are referenced by this spec — no need to create them:
- `updateFile(id, changes)` — used by Sections 4.1–4.5
- `listPotFiles(potSlug)` — used by Section 5.4
- `getFileTags(id)` — available as fallback for tag fetching
