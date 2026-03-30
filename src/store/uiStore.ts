import { create } from 'zustand';
import type { ToolMode, Viewport, SnapResolution } from '../types/ui';

interface UiStore {
  tool: ToolMode;
  viewport: Viewport;
  selectedNoteIds: Set<string>;
  snapDivision: SnapResolution;
  activeTrackId: string | null;
  activeClipId: string | null;
  isPlaying: boolean;
  playheadTick: number;

  // Scale display
  scaleRoot: number; // 0-11
  scaleMode: string;

  setTool: (tool: ToolMode) => void;
  setViewport: (v: Partial<Viewport>) => void;
  setSelectedNoteIds: (ids: Set<string>) => void;
  toggleNoteSelection: (id: string) => void;
  clearSelection: () => void;
  setSnapDivision: (d: SnapResolution) => void;
  setActiveTrack: (id: string | null) => void;
  setActiveClip: (id: string | null) => void;
  setIsPlaying: (v: boolean) => void;
  setPlayheadTick: (t: number) => void;
  setScale: (root: number, mode: string) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  tool: 'draw',
  viewport: {
    scrollX: 0,
    scrollY: 48, // Start viewing around C3-C5 range
    pixelsPerTick: 0.25,
    pixelsPerSemitone: 16,
  },
  selectedNoteIds: new Set<string>(),
  snapDivision: 4, // quarter note grid
  activeTrackId: null,
  activeClipId: null,
  isPlaying: false,
  playheadTick: 0,
  scaleRoot: 0, // C
  scaleMode: 'major',

  setTool: (tool) => set({ tool }),
  setViewport: (v) =>
    set((s) => ({ viewport: { ...s.viewport, ...v } })),
  setSelectedNoteIds: (ids) => set({ selectedNoteIds: ids }),
  toggleNoteSelection: (id) =>
    set((s) => {
      const next = new Set(s.selectedNoteIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedNoteIds: next };
    }),
  clearSelection: () => set({ selectedNoteIds: new Set() }),
  setSnapDivision: (d) => set({ snapDivision: d }),
  setActiveTrack: (id) => set({ activeTrackId: id }),
  setActiveClip: (id) => set({ activeClipId: id }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setPlayheadTick: (t) => set({ playheadTick: t }),
  setScale: (root, mode) => set({ scaleRoot: root, scaleMode: mode }),
}));
