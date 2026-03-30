import { create } from 'zustand';
import type { Project, Note, Clip, Track, ProjectSnapshot } from '../types/model';
import { generateId } from '../utils/id';

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
    chordRegions: [],
    history: [],
    redoStack: [],
  };
}

function cloneProjectState(project: Project): Omit<Project, 'history' | 'redoStack'> {
  const { history: _, redoStack: __, ...rest } = project;
  return JSON.parse(JSON.stringify(rest));
}

function findClip(project: Project, clipId: string): Clip | undefined {
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.id === clipId) return clip;
    }
  }
  return undefined;
}

interface ProjectStore {
  project: Project;

  // Undo/Redo
  pushUndo: () => void;
  undo: () => void;
  redo: () => void;

  // Note mutations
  addNote: (clipId: string, note: Omit<Note, 'id'>) => void;
  moveNotes: (clipId: string, noteIds: string[], deltaTick: number, deltaPitch: number) => void;
  resizeNotes: (clipId: string, noteIds: string[], deltaDuration: number) => void;
  deleteNotes: (clipId: string, noteIds: string[]) => void;
  setNoteVelocity: (clipId: string, noteIds: string[], velocity: number) => void;

  // Project-level
  loadProject: (project: Project) => void;
  setTempo: (bpm: number) => void;
  setKey: (key: string) => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: createDefaultProject(),

  pushUndo: () => {
    const { project } = get();
    const snapshot: ProjectSnapshot = {
      timestamp: Date.now(),
      state: cloneProjectState(project),
    };
    const history = [...project.history, snapshot].slice(-MAX_UNDO);
    set({ project: { ...project, history, redoStack: [] } });
  },

  undo: () => {
    const { project } = get();
    if (project.history.length === 0) return;
    const history = [...project.history];
    const snapshot = history.pop()!;
    const redoSnapshot: ProjectSnapshot = {
      timestamp: Date.now(),
      state: cloneProjectState(project),
    };
    const redoStack = [...project.redoStack, redoSnapshot];
    set({
      project: {
        ...snapshot.state,
        history,
        redoStack,
      },
    });
  },

  redo: () => {
    const { project } = get();
    if (project.redoStack.length === 0) return;
    const redoStack = [...project.redoStack];
    const snapshot = redoStack.pop()!;
    const undoSnapshot: ProjectSnapshot = {
      timestamp: Date.now(),
      state: cloneProjectState(project),
    };
    const history = [...project.history, undoSnapshot];
    set({
      project: {
        ...snapshot.state,
        history,
        redoStack,
      },
    });
  },

  addNote: (clipId, noteData) => {
    get().pushUndo();
    const { project } = get();
    const newProject = { ...project, tracks: project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId
          ? { ...c, notes: [...c.notes, { ...noteData, id: generateId() }] }
          : c
      ),
    }))};
    set({ project: newProject });
  },

  moveNotes: (clipId, noteIds, deltaTick, deltaPitch) => {
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
                idSet.has(n.id)
                  ? {
                      ...n,
                      startTick: Math.max(0, n.startTick + deltaTick),
                      pitch: Math.min(127, Math.max(0, n.pitch + deltaPitch)),
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
    get().pushUndo();
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

  loadProject: (project) => {
    set({ project });
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
