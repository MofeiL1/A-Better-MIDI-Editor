// ─── Project 层（全局） ───────────────────────────────────

export type Project = {
  name: string;
  ticksPerBeat: number; // 1拍 = N tick，通常 480
  tracks: Track[];

  tempoChanges: TempoChange[];
  timeSignatureChanges: TimeSignatureChange[];
  keyChanges: KeyChange[];
  chordRegions: ChordRegion[];

  history: ProjectSnapshot[];
  redoStack: ProjectSnapshot[];
};

export type TempoChange = {
  tick: number;
  bpm: number;
};

export type TimeSignatureChange = {
  tick: number;
  numerator: number;
  denominator: number;
};

export type KeyChange = {
  tick: number;
  key: string; // e.g. "C major", "A minor"
};

export type ChordRegion = {
  startTick: number;
  endTick: number;
};

// ─── Track 层 ────────────────────────────────────────────

export type Track = {
  id: string;
  name: string;
  instrument: string;
  clips: Clip[];
  muted: boolean;
  solo: boolean;
};

// ─── Clip 层 ─────────────────────────────────────────────

export type Clip = {
  id: string;
  startTick: number;
  notes: Note[];
};

// ─── Note 层（最核心） ────────────────────────────────────

export type Note = {
  id: string;
  pitch: number; // 0–127, 60 = C4
  startTick: number;
  duration: number; // 单位: tick
  velocity: number; // 0–127
  channel: number;
  pitchBend: BendPoint[];
};

// ─── MPE 弯音曲线 ─────────────────────────────────────────

export type BendPoint = {
  tick: number; // 相对于音符 startTick 的偏移
  value: number; // -8192 到 +8191
  curveHandle?: {
    x: number;
    y: number;
  };
};

// ─── Undo 快照 ────────────────────────────────────────────

export type ProjectSnapshot = {
  timestamp: number;
  state: Omit<Project, 'history' | 'redoStack'>;
};
