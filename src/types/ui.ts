export type ToolMode = 'select' | 'draw' | 'erase';

export type Viewport = {
  scrollX: number; // in ticks
  scrollY: number; // in semitones from bottom (0 = C-1)
  pixelsPerTick: number;
  pixelsPerSemitone: number;
};

export type SnapResolution = 'smart' | 1 | 2 | 4 | 8 | 16 | 32; // 'smart' = zoom-adaptive

export type UiState = {
  tool: ToolMode;
  viewport: Viewport;
  selectedNoteIds: Set<string>;
  snapDivision: SnapResolution; // how many divisions per beat
  activeTrackId: string | null;
  activeClipId: string | null;
  isPlaying: boolean;
  playheadTick: number;
};
