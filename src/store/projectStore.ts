import { create } from 'zustand';
import type { Project, Note, ChordEvent, ProjectSnapshot } from '../types/model';
import { generateId } from '../utils/id';
import { useUiStore } from './uiStore';

const MAX_UNDO = 50;

/**
 * Generate demo notes: 16-bar jazz chord progression in C major.
 * Showcases chord analysis, ii-V-I detection, tritone sub, secondary dominants,
 * scale degree notation, and resolution arrows.
 *
 * Progression:
 *  1. Cmaj7    (I)
 *  2. Bm7b5   (vii)
 *  3. E7      (V/vi — secondary dominant)
 *  4. Am7     (vi — V→i resolution)
 *  5. Dm7     (ii — start of ii-V-I)
 *  6. G7      (V — ii→V)
 *  7. Cmaj7   (I — V→I)
 *  8. C7      (I7 — dominant of IV)
 *  9. Fmaj7   (IV — V→I from C7)
 * 10. Fm7     (iv — modal interchange)
 * 11. Em7     (iii)
 * 12. A7      (V/ii — secondary dominant)
 * 13. Dm7     (ii — V→I from A7)
 * 14. Db7     (tritone sub of G7!)
 * 15. Cmaj7   (I — bII→I resolution!)
 * 16. G7      (V — turnaround)
 */
function generateDemoNotes(): Note[] {
  const TPB = 480; // ticks per beat
  const BAR = TPB * 4; // ticks per bar (4/4)
  const DUR = BAR; // whole-note duration

  // Each chord: [barIndex, pitches[]]
  const chords: [number, number[]][] = [
    [0,  [48, 52, 55, 59]],  // Cmaj7:  C3 E3 G3 B3
    [1,  [47, 50, 53, 57]],  // Bm7b5:  B2 D3 F3 A3
    [2,  [52, 56, 59, 62]],  // E7:     E3 G#3 B3 D4
    [3,  [45, 48, 52, 55]],  // Am7:    A2 C3 E3 G3
    [4,  [50, 53, 57, 60]],  // Dm7:    D3 F3 A3 C4
    [5,  [43, 47, 50, 53]],  // G7:     G2 B2 D3 F3
    [6,  [48, 52, 55, 59]],  // Cmaj7:  C3 E3 G3 B3
    [7,  [48, 52, 55, 58]],  // C7:     C3 E3 G3 Bb3
    [8,  [53, 57, 60, 64]],  // Fmaj7:  F3 A3 C4 E4
    [9,  [53, 56, 60, 63]],  // Fm7:    F3 Ab3 C4 Eb4
    [10, [52, 55, 59, 62]],  // Em7:    E3 G3 B3 D4
    [11, [45, 49, 52, 55]],  // A7:     A2 C#3 E3 G3
    [12, [50, 53, 57, 60]],  // Dm7:    D3 F3 A3 C4
    [13, [49, 53, 56, 59]],  // Db7:    Db3 F3 Ab3 B3
    [14, [48, 52, 55, 59]],  // Cmaj7:  C3 E3 G3 B3
    [15, [43, 47, 50, 53]],  // G7:     G2 B2 D3 F3
  ];

  const notes: Note[] = [];
  for (const [bar, pitches] of chords) {
    for (const pitch of pitches) {
      notes.push({
        id: generateId(),
        pitch,
        startTick: bar * BAR,
        duration: DUR,
        velocity: 80,
        channel: 0,
        pitchBend: [],
      });
    }
  }
  return notes;
}

function createDefaultProject(): Project {
  const trackId = generateId();
  const clipId = generateId();
  return {
    name: 'Jazz Demo',
    ticksPerBeat: 480,
    tracks: [
      {
        id: trackId,
        name: 'Track 1',
        instrument: 'piano',
        clips: [
          {
            id: clipId,
            startTick: 0,
            notes: generateDemoNotes(),
          },
        ],
        muted: false,
        solo: false,
      },
    ],
    tempoChanges: [{ tick: 0, bpm: 120 }],
    timeSignatureChanges: [{ tick: 0, numerator: 4, denominator: 4 }],
    keyChanges: [{ tick: 0, key: 'C major' }],
    chordEvents: [],
    history: [],
    redoStack: [],
  };
}

function cloneProjectState(project: Project): Omit<Project, 'history' | 'redoStack'> {
  const { history: _, redoStack: __, ...rest } = project;
  return JSON.parse(JSON.stringify(rest));
}

interface ProjectStore {
  project: Project;
  isDragging: boolean;

  // Undo/Redo
  pushUndo: () => void;
  undo: () => void;
  redo: () => void;

  // Drag lifecycle — push undo once at drag start, suppress during drag
  beginDrag: () => void;
  endDrag: () => void;

  // Note mutations
  addNote: (clipId: string, note: Omit<Note, 'id'>) => string;
  drawEditNote: (clipId: string, noteId: string, pitch: number, duration: number) => void;
  moveNotes: (clipId: string, noteIds: string[], deltaTick: number, deltaPitch: number) => void;
  resizeNotes: (clipId: string, noteIds: string[], deltaDuration: number) => void;
  trimNoteStart: (clipId: string, noteIds: string[], deltaTick: number) => void;
  deleteNotes: (clipId: string, noteIds: string[]) => void;
  setNoteVelocity: (clipId: string, noteIds: string[], velocity: number) => void;
  setNoteVelocities: (clipId: string, velocities: Map<string, number>) => void;
  pasteNotes: (clipId: string, notes: Omit<Note, 'id'>[], atTick: number) => string[];

  // Chord events
  addChordEvent: (event: Omit<ChordEvent, 'id'>) => string;
  updateChordEvent: (id: string, updates: Partial<Omit<ChordEvent, 'id'>>) => void;
  deleteChordEvent: (id: string) => void;

  // Project-level
  loadProject: (project: Project) => void;
  setProjectName: (name: string) => void;
  setTempo: (bpm: number) => void;
  setTimeSignature: (numerator: number, denominator: number) => void;
  setKey: (key: string) => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: createDefaultProject(),
  isDragging: false,

  beginDrag: () => {
    get().pushUndo();
    set({ isDragging: true });
  },
  endDrag: () => set({ isDragging: false }),

  pushUndo: () => {
    const { project } = get();
    const { selectedNoteIds } = useUiStore.getState();
    const snapshot: ProjectSnapshot = {
      timestamp: Date.now(),
      state: cloneProjectState(project),
      selectedNoteIds: Array.from(selectedNoteIds),
    };
    const history = [...project.history, snapshot].slice(-MAX_UNDO);
    set({ project: { ...project, history, redoStack: [] } });
  },

  undo: () => {
    const { project } = get();
    if (project.history.length === 0) return;
    const { selectedNoteIds, setSelectedNoteIds } = useUiStore.getState();
    const history = [...project.history];
    const snapshot = history.pop()!;
    const redoSnapshot: ProjectSnapshot = {
      timestamp: Date.now(),
      state: cloneProjectState(project),
      selectedNoteIds: Array.from(selectedNoteIds),
    };
    const redoStack = [...project.redoStack, redoSnapshot];
    set({
      project: {
        ...snapshot.state,
        history,
        redoStack,
      },
    });
    setSelectedNoteIds(new Set(snapshot.selectedNoteIds));
  },

  redo: () => {
    const { project } = get();
    if (project.redoStack.length === 0) return;
    const { selectedNoteIds, setSelectedNoteIds } = useUiStore.getState();
    const redoStack = [...project.redoStack];
    const snapshot = redoStack.pop()!;
    const undoSnapshot: ProjectSnapshot = {
      timestamp: Date.now(),
      state: cloneProjectState(project),
      selectedNoteIds: Array.from(selectedNoteIds),
    };
    const history = [...project.history, undoSnapshot];
    set({
      project: {
        ...snapshot.state,
        history,
        redoStack,
      },
    });
    setSelectedNoteIds(new Set(snapshot.selectedNoteIds));
  },

  addNote: (clipId, noteData) => {
    if (!get().isDragging) get().pushUndo();
    const { project } = get();
    const id = generateId();
    const newProject = { ...project, tracks: project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId
          ? { ...c, notes: [...c.notes, { ...noteData, id }] }
          : c
      ),
    }))};
    set({ project: newProject });
    return id;
  },

  drawEditNote: (clipId, noteId, pitch, duration) => {
    if (!get().isDragging) get().pushUndo();
    const { project } = get();
    const newProject = { ...project, tracks: project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              notes: c.notes.map((n) =>
                n.id === noteId
                  ? { ...n, pitch: Math.min(127, Math.max(0, pitch)), duration: Math.max(1, duration) }
                  : n
              ),
            }
          : c
      ),
    }))};
    set({ project: newProject });
  },

  moveNotes: (clipId, noteIds, deltaTick, deltaPitch) => {
    if (!get().isDragging) get().pushUndo();
    const { project } = get();
    const idSet = new Set(noteIds);

    // Find the selected notes to clamp the delta for the whole group
    const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
    if (!clip) return;
    const selected = clip.notes.filter((n) => idSet.has(n.id));
    if (selected.length === 0) return;

    // Clamp deltaTick: no note should go below startTick 0
    let clampedDeltaTick = deltaTick;
    const minStart = Math.min(...selected.map((n) => n.startTick));
    if (minStart + clampedDeltaTick < 0) {
      clampedDeltaTick = -minStart;
    }

    // Clamp deltaPitch: no note should go below 0 or above 127
    let clampedDeltaPitch = deltaPitch;
    const minPitch = Math.min(...selected.map((n) => n.pitch));
    const maxPitch = Math.max(...selected.map((n) => n.pitch));
    if (minPitch + clampedDeltaPitch < 0) {
      clampedDeltaPitch = -minPitch;
    }
    if (maxPitch + clampedDeltaPitch > 127) {
      clampedDeltaPitch = 127 - maxPitch;
    }

    if (clampedDeltaTick === 0 && clampedDeltaPitch === 0) return;

    const newProject = { ...project, tracks: project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              notes: c.notes.map((n) =>
                idSet.has(n.id)
                  ? {
                      ...n,
                      startTick: n.startTick + clampedDeltaTick,
                      pitch: n.pitch + clampedDeltaPitch,
                    }
                  : n
              ),
            }
          : c
      ),
    }))};
    set({ project: newProject });
  },

  resizeNotes: (clipId, noteIds, deltaDuration) => {
    if (!get().isDragging) get().pushUndo();
    const { project } = get();
    const idSet = new Set(noteIds);
    const newProject = { ...project, tracks: project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              notes: c.notes.map((n) =>
                idSet.has(n.id)
                  ? { ...n, duration: Math.max(1, n.duration + deltaDuration) }
                  : n
              ),
            }
          : c
      ),
    }))};
    set({ project: newProject });
  },

  trimNoteStart: (clipId, noteIds, deltaTick) => {
    if (!get().isDragging) get().pushUndo();
    const { project } = get();
    const idSet = new Set(noteIds);
    const newProject = { ...project, tracks: project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              notes: c.notes.map((n) => {
                if (!idSet.has(n.id)) return n;
                const newStart = Math.max(0, n.startTick + deltaTick);
                const actualDelta = newStart - n.startTick;
                const newDuration = Math.max(1, n.duration - actualDelta);
                return { ...n, startTick: newStart, duration: newDuration };
              }),
            }
          : c
      ),
    }))};
    set({ project: newProject });
  },

  deleteNotes: (clipId, noteIds) => {
    get().pushUndo();
    const { project } = get();
    const idSet = new Set(noteIds);
    const newProject = { ...project, tracks: project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId
          ? { ...c, notes: c.notes.filter((n) => !idSet.has(n.id)) }
          : c
      ),
    }))};
    set({ project: newProject });
  },

  setNoteVelocity: (clipId, noteIds, velocity) => {
    if (!get().isDragging) get().pushUndo();
    const { project } = get();
    const idSet = new Set(noteIds);
    const v = Math.min(127, Math.max(0, velocity));
    const newProject = { ...project, tracks: project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              notes: c.notes.map((n) =>
                idSet.has(n.id) ? { ...n, velocity: v } : n
              ),
            }
          : c
      ),
    }))};
    set({ project: newProject });
  },

  setNoteVelocities: (clipId, velocities) => {
    if (!get().isDragging) get().pushUndo();
    const { project } = get();
    const newProject = { ...project, tracks: project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              notes: c.notes.map((n) => {
                const v = velocities.get(n.id);
                return v !== undefined ? { ...n, velocity: Math.max(1, Math.min(127, v)) } : n;
              }),
            }
          : c
      ),
    }))};
    set({ project: newProject });
  },

  pasteNotes: (clipId, notes, atTick) => {
    if (notes.length === 0) return [];
    get().pushUndo();
    const { project } = get();
    // Align earliest note to atTick
    const earliestTick = Math.min(...notes.map((n) => n.startTick));
    const offset = atTick - earliestTick;
    const newIds: string[] = [];
    const newNotes = notes.map((n) => {
      const id = generateId();
      newIds.push(id);
      return { ...n, id, startTick: Math.max(0, n.startTick + offset) };
    });
    const newProject = { ...project, tracks: project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId ? { ...c, notes: [...c.notes, ...newNotes] } : c
      ),
    }))};
    set({ project: newProject });
    return newIds;
  },

  addChordEvent: (eventData) => {
    get().pushUndo();
    const { project } = get();
    const id = generateId();
    set({
      project: {
        ...project,
        chordEvents: [...project.chordEvents, { ...eventData, id }],
      },
    });
    return id;
  },

  updateChordEvent: (id, updates) => {
    get().pushUndo();
    const { project } = get();
    set({
      project: {
        ...project,
        chordEvents: project.chordEvents.map((e) =>
          e.id === id ? { ...e, ...updates } : e
        ),
      },
    });
  },

  deleteChordEvent: (id) => {
    get().pushUndo();
    const { project } = get();
    set({
      project: {
        ...project,
        chordEvents: project.chordEvents.filter((e) => e.id !== id),
      },
    });
  },

  loadProject: (project) => {
    set({ project });
  },

  setProjectName: (name) => {
    const { project } = get();
    set({ project: { ...project, name } });
  },

  setTempo: (bpm) => {
    get().pushUndo();
    const { project } = get();
    set({
      project: {
        ...project,
        tempoChanges: [{ tick: 0, bpm }],
      },
    });
  },

  setTimeSignature: (numerator, denominator) => {
    get().pushUndo();
    const { project } = get();
    set({
      project: {
        ...project,
        timeSignatureChanges: [{ tick: 0, numerator, denominator }],
      },
    });
  },

  setKey: (key) => {
    get().pushUndo();
    const { project } = get();
    set({
      project: {
        ...project,
        keyChanges: [{ tick: 0, key }],
      },
    });
  },
}));
