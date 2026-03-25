import { create } from "zustand";
import type { PotRecord, ProjectionPoint } from "../../types";
import * as api from "../../api";

const IDLE_TIMEOUT = 30_000; // 30 seconds

interface VisualizationState {
  // Pot state
  selectedPotId: string | null;
  pots: PotRecord[];
  potFileIds: Set<string>;

  // File interaction state
  clickedFileId: string | null;
  hoveredFileId: string | null;

  // Camera idle state
  lastInteractionTime: number;

  // Actions
  selectPot: (id: string | null) => void;
  clickFile: (id: string | null) => void;
  hoverFile: (id: string | null) => void;
  recordInteraction: () => void;
  isIdle: () => boolean;

  // Pot CRUD
  fetchPots: () => Promise<void>;
  createPot: (name: string) => Promise<void>;
  renamePot: (id: string, name: string) => Promise<void>;
  deletePot: (id: string) => Promise<void>;

  // File-pot assignment
  assignFileToPot: (fileId: string, potSlug: string, currentTags: string[]) => Promise<void>;
  unassignFileFromPot: (fileId: string, potSlug: string, currentTags: string[]) => Promise<void>;
}

export const useVisualizationStore = create<VisualizationState>((set, get) => ({
  selectedPotId: null,
  pots: [],
  potFileIds: new Set(),
  clickedFileId: null,
  hoveredFileId: null,
  lastInteractionTime: Date.now(),

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

  clickFile: (id) => {
    set({ clickedFileId: id });
    get().recordInteraction();
  },

  hoverFile: (id) => set({ hoveredFileId: id }),

  recordInteraction: () => set({ lastInteractionTime: Date.now() }),

  // Polling function for useFrame — not a reactive selector. Call inside useFrame() only.
  isIdle: () => Date.now() - get().lastInteractionTime > IDLE_TIMEOUT,

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
