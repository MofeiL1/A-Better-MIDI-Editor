import { create } from 'zustand';
import type { Project, Note, ProjectSnapshot } from '../types/model';
import { getEffectiveDuration } from '../utils/noteDuration';

import { generateId } from '../utils/id';
import { useUiStore } from './uiStore';

const MAX_UNDO = 50;

function createDefaultProject(): Project {
  const trackId = generateId();
  const clipId = generateId();
  return {
    name: 'Untitled',
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
            notes: [],
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

  // Duration confirmation
  confirmDuration: (clipId: string, noteIds: string[]) => void;
  clearDuration: (clipId: string, noteIds: string[]) => void;
  setNoteDuration: (clipId: string, noteIds: string[], duration: number) => void;

  // Role
  setNoteRole: (clipId: string, noteIds: string[], role: 'melody' | 'chord' | undefined) => void;

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
      clips: t.clips.map((c) => {
        if (c.id !== clipId) return c;
        return { ...c, notes: [...c.notes, { ...noteData, id } as Note] };
      }),
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

    const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
    if (!clip) return;
    const selected = clip.notes.filter((n) => idSet.has(n.id));
    if (selected.length === 0) return;

    let clampedDeltaTick = deltaTick;
    const minStart = Math.min(...selected.map((n) => n.startTick));
    if (minStart + clampedDeltaTick < 0) {
      clampedDeltaTick = -minStart;
    }

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
                  ? { ...n, duration: Math.max(1, (n.duration ?? 0) + deltaDuration) }
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
                if (n.duration === null) {
                  // Null-duration: just move startTick
                  const newStart = Math.max(0, n.startTick + deltaTick);
                  return { ...n, startTick: newStart };
                }
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

  // ─── Duration confirmation ─────────────────────────────

  confirmDuration: (clipId, noteIds) => {
    get().pushUndo();
    const { project } = get();
    const idSet = new Set(noteIds);
    const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
    if (!clip) return;
    const allNotes = clip.notes;
    const ts = project.timeSignatureChanges[0] ?? { numerator: 4, denominator: 4 };
    const ticksPerMeasure = project.ticksPerBeat * ts.numerator * (4 / ts.denominator);

    const newProject = { ...project, tracks: project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              notes: c.notes.map((n) => {
                if (!idSet.has(n.id) || n.duration !== null) return n;
                return { ...n, duration: getEffectiveDuration(n, allNotes, ticksPerMeasure) };
              }),
            }
          : c
      ),
    }))};
    set({ project: newProject });
  },

  clearDuration: (clipId, noteIds) => {
    get().pushUndo();
    const { project } = get();
    const idSet = new Set(noteIds);
    const newProject = { ...project, tracks: project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              notes: c.notes.map((n) =>
                idSet.has(n.id) && n.duration !== null ? { ...n, duration: null } : n
              ),
            }
          : c
      ),
    }))};
    set({ project: newProject });
  },

  setNoteDuration: (clipId, noteIds, duration) => {
    get().pushUndo();
    const { project } = get();
    const idSet = new Set(noteIds);
    const newProject = { ...project, tracks: project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              notes: c.notes.map((n) =>
                idSet.has(n.id) ? { ...n, duration } : n
              ),
            }
          : c
      ),
    }))};
    set({ project: newProject });
  },

  setNoteRole: (clipId, noteIds, role) => {
    get().pushUndo();
    const { project } = get();
    const idSet = new Set(noteIds);
    const newProject = { ...project, tracks: project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              notes: c.notes.map((n) =>
                idSet.has(n.id) ? { ...n, role } : n
              ),
            }
          : c
      ),
    }))};
    set({ project: newProject });
  },

  // ─── Project-level ─────────────────────────────────────

  loadProject: (project) => {
    // Migrate: remove old dots array if present, convert to null-duration notes
    const migrated = {
      ...project,
      tracks: project.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          const clip = c as Record<string, unknown>;
          const existingNotes = (clip.notes as Note[]) ?? [];
          // Migrate old dots to null-duration notes
          const oldDots = (clip.dots as Array<{ id: string; pitch: number; startTick: number; velocity: number }>) ?? [];
          const migratedDots: Note[] = oldDots.map((d) => ({
            id: d.id,
            pitch: d.pitch,
            startTick: d.startTick,
            duration: null,
            velocity: d.velocity,
            channel: 0,
            pitchBend: [],
          }));
          return {
            id: c.id,
            startTick: c.startTick,
            notes: [...existingNotes, ...migratedDots],
          };
        }),
      })),
    };
    set({ project: migrated });
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
