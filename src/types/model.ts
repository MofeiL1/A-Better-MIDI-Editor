// ─── Project 层（全局） ───────────────────────────────────

export type Project = {
  name: string;
  ticksPerBeat: number; // 1拍 = N tick，通常 480
  tracks: Track[];

  tempoChanges: TempoChange[];
  timeSignatureChanges: TimeSignatureChange[];
  keyChanges: KeyChange[];
  chordEvents: ChordEvent[];

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

// ─── Chord Event（和弦轨道条目） ──────────────────────────

export type ChordEvent = {
  id: string;
  startTick: number;
  endTick: number;

  root: number;           // 0-11 pitch class
  quality: string;        // "maj7", "m7", "7", "dim7", "m7b5", etc.
  bass?: number;          // slash chord bass note, 0-11 pitch class

  source: 'user' | 'detected';
  confidence?: number;    // 0-1, only meaningful for detected

  memberNoteIds?: string[];
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
  duration: number | null; // 单位: tick, null = 未确认长度（auto legato）
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
  selectedNoteIds: string[];
};
