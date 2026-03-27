import { create } from "zustand";
import type { PotRecord } from "../../types";
import * as api from "../../api";

interface VisualizationState {
  // Pot state
  selectedPotId: string | null;
  pots: PotRecord[];
  potFileIds: Set<string>;

  // File interaction state
  clickedFileId: string | null;
  hoveredFileId: string | null;

  // Actions
  selectPot: (id: string | null) => void;
  clickFile: (id: string | null) => void;
  hoverFile: (id: string | null) => void;
  recordInteraction: () => void;

  // Pot CRUD
  fetchPots: () => Promise<void>;
  createPot: (name: string) => Promise<void>;
  renamePot: (id: string, name: string) => Promise<void>;
  deletePot: (id: string) => Promise<void>;

  // File-pot assignment
  assignFileToPot: (fileId: string, potSlug: string, currentTags: string[]) => Promise<void>;
  unassignFileFromPot: (fileId: string, potSlug: string, currentTags: string[]) => Promise<void>;

  // Pending deletes (soft delete with undo)
  pendingDeletes: Map<string, { timer: ReturnType<typeof setTimeout>; fileName: string }>;
  scheduleDelete: (id: string, fileName: string, onComplete: () => void) => void;
  cancelDelete: (id: string) => void;
}

export const useVisualizationStore = create<VisualizationState>((set, get) => ({
  selectedPotId: null,
  pots: [],
  potFileIds: new Set(),
  clickedFileId: null,
  hoveredFileId: null,

  selectPot: async (id) => {
    set({ selectedPotId: id, potFileIds: new Set() });
    if (!id) return;

    const pot = get().pots.find((p) => p.id === id);
    if (!pot) return;

    try {
      const data = await api.listPotFiles(pot.slug);
      const ids = new Set<string>((data.items ?? []).map((f: { id: string }) => f.id));
      if (get().selectedPotId === id) {
        set({ potFileIds: ids });
      }
    } catch (err) {
      console.error("Failed to fetch pot files:", err);
    }
  },

  clickFile: (id) => set({ clickedFileId: id }),

  hoverFile: (id) => set({ hoveredFileId: id }),

  recordInteraction: () => {},

  fetchPots: async () => {
    try {
      const data = await api.listPots();
      set({ pots: data.pots ?? [] });
    } catch (err) {
      console.error("Failed to fetch pots:", err);
    }
  },

  createPot: async (name) => {
    try {
      await api.createPot(name);
      await get().fetchPots();
    } catch (err) {
      console.error("Failed to create pot:", err);
    }
  },

  renamePot: async (id, name) => {
    try {
      await api.renamePot(id, name);
      await get().fetchPots();
    } catch (err) {
      console.error("Failed to rename pot:", err);
    }
  },

  deletePot: async (id) => {
    try {
      await api.deletePot(id);
      if (get().selectedPotId === id) {
        set({ selectedPotId: null, potFileIds: new Set() });
      }
      await get().fetchPots();
    } catch (err) {
      console.error("Failed to delete pot:", err);
    }
  },

  pendingDeletes: new Map(),

  scheduleDelete: (id, fileName, onComplete) => {
    const timer = setTimeout(async () => {
      try {
        await api.deleteFile(id);
      } catch {}
      const next = new Map(get().pendingDeletes);
      next.delete(id);
      set({ pendingDeletes: next });
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

  assignFileToPot: async (fileId, potSlug, _currentTags) => {
    const potTag = `pot:${potSlug}`;
    try {
      // Fetch fresh tags from server to avoid stale projection cache
      const file = await api.getFileTags(fileId);
      const freshTags: string[] = file.tags ?? _currentTags;
      if (freshTags.includes(potTag)) return;
      await api.updateFile(fileId, { tags: [...freshTags, potTag] });
      // Always refresh highlights for the selected pot
      const { selectedPotId } = get();
      if (selectedPotId) get().selectPot(selectedPotId);
    } catch (err) {
      console.error("Failed to assign file to pot:", err);
    }
  },

  unassignFileFromPot: async (fileId, potSlug, _currentTags) => {
    const potTag = `pot:${potSlug}`;
    try {
      // Fetch fresh tags from server to avoid stale projection cache
      const file = await api.getFileTags(fileId);
      const freshTags: string[] = file.tags ?? _currentTags;
      await api.updateFile(fileId, { tags: freshTags.filter((t) => t !== potTag) });
      // Always refresh highlights for the selected pot
      const { selectedPotId } = get();
      if (selectedPotId) get().selectPot(selectedPotId);
    } catch (err) {
      console.error("Failed to unassign file from pot:", err);
    }
  },
}));
