import { create } from 'zustand';
import type { Project, Note, ProjectSnapshot } from '../types/model';
import { generateId } from '../utils/id';
import { useUiStore } from './uiStore';

const MAX_UNDO = 50;

/**
 * Generate demo notes: "Blue Bossa" (Kenny Dorham) — 16-bar jazz standard.
 * Showcases key modulation detection (Cm → Db → Cm), ii-V-I patterns,
 * chord analysis, and resolution arrows.
 *
 * Progression:
 *  1. Cm7     (i in Cm)
 *  2. Cm7     (i)
 *  3. Fm7     (iv)
 *  4. Fm7     (iv)
 *  5. Dm7b5   (ii in Cm)
 *  6. G7      (V — ii-V)
 *  7. Cm7     (i — V→i resolution)
 *  8. Cm7     (i)
 *  9. Ebm7    (ii in Db — modulation!)
 * 10. Ab7     (V in Db — ii→V)
 * 11. Dbmaj7  (I in Db — V→I resolution)
 * 12. Dbmaj7  (I)
 * 13. Dm7b5   (ii in Cm — back to Cm!)
 * 14. G7      (V — ii→V)
 * 15. Cm7     (i — V→i resolution)
 * 16. Cm7     (i)
 */
function generateDemoNotes(): Note[] {
  const TPB = 480; // ticks per beat
  const BAR = TPB * 4; // ticks per bar (4/4)
  const DUR = BAR; // whole-note duration

  // Each chord: [barIndex, pitches[]]
  const chords: [number, number[]][] = [
    [0,  [48, 51, 55, 58]],  // Cm7:    C3 Eb3 G3 Bb3
    [1,  [48, 51, 55, 58]],  // Cm7:    C3 Eb3 G3 Bb3
    [2,  [53, 56, 60, 63]],  // Fm7:    F3 Ab3 C4 Eb4
    [3,  [53, 56, 60, 63]],  // Fm7:    F3 Ab3 C4 Eb4
    [4,  [50, 53, 56, 60]],  // Dm7b5:  D3 F3 Ab3 C4
    [5,  [43, 47, 50, 53]],  // G7:     G2 B2 D3 F3
    [6,  [48, 51, 55, 58]],  // Cm7:    C3 Eb3 G3 Bb3
    [7,  [48, 51, 55, 58]],  // Cm7:    C3 Eb3 G3 Bb3
    [8,  [51, 54, 58, 61]],  // Ebm7:   Eb3 Gb3 Bb3 Db4
    [9,  [44, 48, 51, 54]],  // Ab7:    Ab2 C3 Eb3 Gb3
    [10, [49, 53, 56, 60]],  // Dbmaj7: Db3 F3 Ab3 C4
    [11, [49, 53, 56, 60]],  // Dbmaj7: Db3 F3 Ab3 C4
    [12, [50, 53, 56, 60]],  // Dm7b5:  D3 F3 Ab3 C4
    [13, [43, 47, 50, 53]],  // G7:     G2 B2 D3 F3
    [14, [48, 51, 55, 58]],  // Cm7:    C3 Eb3 G3 Bb3
    [15, [48, 51, 55, 58]],  // Cm7:    C3 Eb3 G3 Bb3
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
    name: 'Blue Bossa',
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
    keyChanges: [{ tick: 0, key: 'C minor' }],
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
