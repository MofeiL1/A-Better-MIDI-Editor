import { create } from 'zustand';
import type { ToolMode, Viewport, SnapResolution } from '../types/ui';
import type { Note } from '../types/model';

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
  scaleAutoDetect: boolean;

  // Audio latency (lookAhead in seconds).
  audioLatency: number;
  samplerReady: boolean;

  // Copy/paste clipboard (pure UI, not undoable)
  clipboard: Note[];

  // Velocity drag highlight — which note is being velocity-dragged (shown in NoteLayer)
  velocityDragNoteId: string | null;

  // Hover highlight — bidirectional between NoteLayer and VelocityLane
  hoveredNoteId: string | null;

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
  setAutoDetect: (on: boolean) => void;
  setAudioLatency: (v: number) => void;
  setSamplerReady: (v: boolean) => void;
  setClipboard: (notes: Note[]) => void;
  setVelocityDragNoteId: (id: string | null) => void;
  setHoveredNoteId: (id: string | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  tool: 'draw',
  viewport: {
    scrollX: 0,
    scrollY: 48, // Start viewing around C3-C5 range
    pixelsPerTick: 0.125, // Half of previous 0.25 — shows ~4 bars at default width
    pixelsPerSemitone: 16,
  },
  selectedNoteIds: new Set<string>(),
  snapDivision: 1, // whole note (1/1) grid
  activeTrackId: null,
  activeClipId: null,
  isPlaying: false,
  playheadTick: 0,
  scaleRoot: 0, // C
  scaleMode: 'major',
  scaleAutoDetect: true,
  audioLatency: 0.05,
  samplerReady: false,
  clipboard: [],
  velocityDragNoteId: null,
  hoveredNoteId: null,

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
  setAutoDetect: (on) => set({ scaleAutoDetect: on }),
  setAudioLatency: (v) => set({ audioLatency: v }),
  setSamplerReady: (v) => set({ samplerReady: v }),
  setClipboard: (notes) => set({ clipboard: notes }),
  setVelocityDragNoteId: (id) => set({ velocityDragNoteId: id }),
  setHoveredNoteId: (id) => set({ hoveredNoteId: id }),
}));
