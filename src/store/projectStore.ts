import { create } from 'zustand';
import type { Project, Note, ChordEvent, ProjectSnapshot } from '../types/model';
import { generateId } from '../utils/id';
import { useUiStore } from './uiStore';

const MAX_UNDO = 50;

/**
 * Generate demo notes: 32-bar piece with arpeggios, melody, walking bass,
 * and key modulation. Showcases chord boundary detection across different
 * textures and tonal segmentation with clear key changes.
 *
 * Structure:
 *   A  (bars 0-7):   C major — melody + broken chord accompaniment
 *   B  (bars 8-15):  Modulate to G major via ii-V
 *   A' (bars 16-23): Back to C major — walking bass variation
 *   C  (bars 24-31): To F major, cadence back to C
 *
 * Textures: arpeggiated LH, melodic RH, occasional walking bass,
 * block chords at cadences — tests all chord boundary detection paths.
 */
function generateDemoNotes(): Note[] {
  const TPB = 480;
  const BAR = TPB * 4;
  const BEAT = TPB;
  const HALF = TPB * 2;
  const QUARTER = TPB;
  const EIGHTH = TPB / 2;

  const notes: Note[] = [];

  const add = (pitch: number, startTick: number, duration: number, velocity = 75) => {
    notes.push({
      id: generateId(), pitch, startTick, duration, velocity,
      channel: 0, pitchBend: [],
    });
  };

  // Helper: broken chord arpeggio (bass + 3 chord tones cycling as 8th notes)
  const arpeggio = (bar: number, bass: number, tones: number[], vel = 65) => {
    const t = bar * BAR;
    // Bass on beat 1 (quarter note)
    add(bass, t, QUARTER, vel + 10);
    // Arpeggio pattern: cycle through tones as 8th notes on beats 1.5-4
    const positions = [EIGHTH * 1, EIGHTH * 2, EIGHTH * 3, EIGHTH * 4, EIGHTH * 5, EIGHTH * 6];
    for (let i = 0; i < positions.length; i++) {
      add(tones[i % tones.length], t + BEAT + positions[i] - EIGHTH, EIGHTH, vel);
    }
  };

  // Helper: walking bass (4 quarter notes per bar)
  const walkBass = (bar: number, pitches: number[], vel = 70) => {
    const t = bar * BAR;
    for (let i = 0; i < 4; i++) {
      add(pitches[i], t + i * BEAT, QUARTER, vel);
    }
  };

  // Helper: block chord (all notes at once, half note or whole note)
  const block = (bar: number, pitches: number[], beat: number, dur: number, vel = 75) => {
    const t = bar * BAR + beat * BEAT;
    for (const p of pitches) add(p, t, dur, vel);
  };

  // Helper: melody note
  const mel = (bar: number, beat: number, pitch: number, dur: number, vel = 85) => {
    add(pitch, bar * BAR + beat * BEAT, dur, vel);
  };

  // ═══════════════════════════════════════════════════════
  // Section A: C major (bars 0-7) — arpeggiated accompaniment + melody
  // ═══════════════════════════════════════════════════════

  // Bar 0: Cmaj7 — I
  arpeggio(0, 36, [48, 52, 55, 59]);           // C2 bass, C3-E3-G3-B3
  mel(0, 0, 72, HALF);                          // C5 half
  mel(0, 2, 71, QUARTER);                       // B4
  mel(0, 3, 72, QUARTER);                       // C5

  // Bar 1: Am7 — vi
  arpeggio(1, 33, [48, 52, 55, 57]);           // A1 bass, C3-E3-G3-A3
  mel(1, 0, 76, HALF);                          // E5
  mel(1, 2, 74, HALF);                          // D5

  // Bar 2: Dm7 — ii
  arpeggio(2, 38, [50, 53, 57, 60]);           // D2 bass, D3-F3-A3-C4
  mel(2, 0, 74, QUARTER);                       // D5
  mel(2, 1, 72, QUARTER);                       // C5
  mel(2, 2, 69, HALF);                          // A4

  // Bar 3: G7 — V
  arpeggio(3, 31, [43, 47, 50, 53]);           // G1 bass, G2-B2-D3-F3
  mel(3, 0, 71, HALF);                          // B4
  mel(3, 2, 74, HALF);                          // D5

  // Bar 4: Em7 — iii
  arpeggio(4, 40, [52, 55, 59, 62]);           // E2 bass, E3-G3-B3-D4
  mel(4, 0, 76, HALF);                          // E5
  mel(4, 2, 79, QUARTER);                       // G5
  mel(4, 3, 76, QUARTER);                       // E5

  // Bar 5: Am7 — vi
  arpeggio(5, 33, [48, 52, 55, 57]);           // A1 bass, C3-E3-G3-A3
  mel(5, 0, 77, HALF);                          // F5
  mel(5, 2, 76, HALF);                          // E5

  // Bar 6: Dm7 — ii
  arpeggio(6, 38, [50, 53, 57, 60]);           // D2 bass, D3-F3-A3-C4
  mel(6, 0, 74, QUARTER);                       // D5
  mel(6, 1, 76, QUARTER);                       // E5
  mel(6, 2, 77, HALF);                          // F5

  // Bar 7: G7 — V (cadence to next section)
  arpeggio(7, 31, [43, 47, 50, 53]);           // G1 bass, G2-B2-D3-F3
  mel(7, 0, 79, HALF);                          // G5
  mel(7, 2, 77, QUARTER);                       // F5
  mel(7, 3, 74, QUARTER);                       // D5

  // ═══════════════════════════════════════════════════════
  // Section B: Modulate to G major (bars 8-15)
  // ═══════════════════════════════════════════════════════

  // Bar 8: Am7 — ii/G (pivot)
  arpeggio(8, 33, [48, 52, 55, 57]);           // A1, C3-E3-G3-A3
  mel(8, 0, 72, HALF);                          // C5
  mel(8, 2, 71, HALF);                          // B4

  // Bar 9: D7 — V/G
  arpeggio(9, 38, [50, 54, 57, 60]);           // D2, D3-F#3-A3-C4
  mel(9, 0, 74, HALF);                          // D5
  mel(9, 2, 78, HALF);                          // F#5

  // Bar 10: Gmaj7 — I/G
  arpeggio(10, 31, [43, 47, 50, 54]);          // G1, G2-B2-D3-F#3
  mel(10, 0, 79, HALF);                         // G5
  mel(10, 2, 78, QUARTER);                      // F#5
  mel(10, 3, 74, QUARTER);                      // D5

  // Bar 11: Gmaj7 — I/G
  arpeggio(11, 43, [47, 50, 54, 55]);          // G2, B2-D3-F#3-G3
  mel(11, 0, 71, HALF);                         // B4
  mel(11, 2, 74, HALF);                         // D5

  // Bar 12: Em7 — vi/G
  arpeggio(12, 40, [52, 55, 59, 62]);          // E2, E3-G3-B3-D4
  mel(12, 0, 76, HALF);                         // E5
  mel(12, 2, 79, HALF);                         // G5

  // Bar 13: C#m7b5 — leading to ii-V back
  arpeggio(13, 37, [49, 52, 55, 59]);          // C#2, C#3-E3-G3-B3
  mel(13, 0, 76, QUARTER);                      // E5
  mel(13, 1, 74, QUARTER);                      // D5
  mel(13, 2, 73, HALF);                         // C#5

  // Bar 14: F#7 — V/vi (secondary dominant)
  arpeggio(14, 30, [42, 46, 49, 52]);          // F#1, F#2-A#2-C#3-E3
  mel(14, 0, 73, HALF);                         // C#5
  mel(14, 2, 71, HALF);                         // B4

  // Bar 15: Bm7 → E7 (half bar each, quick ii-V back toward A or C)
  block(15, [35, 47, 50, 54, 57], 0, HALF, 70);  // B1-B2-D3-F#3-A3 (Bm7)
  mel(15, 0, 74, QUARTER);                       // D5
  mel(15, 1, 71, QUARTER);                       // B4
  block(15, [40, 52, 56, 59, 62], 2, HALF, 70);  // E2-E3-G#3-B3-D4 (E7)
  mel(15, 2, 68, QUARTER);                       // G#4
  mel(15, 3, 71, QUARTER);                       // B4

  // ═══════════════════════════════════════════════════════
  // Section A': Back to C major (bars 16-23) — walking bass variation
  // ═══════════════════════════════════════════════════════

  // Bar 16: Am7 — vi (arrival)
  walkBass(16, [33, 36, 38, 40]);               // A1-C2-D2-E2
  block(16, [57, 60, 64, 67], 0, BAR, 60);     // A3-C4-E4-G4 (pad)
  mel(16, 0, 72, HALF);                          // C5
  mel(16, 2, 76, HALF);                          // E5

  // Bar 17: Dm7 — ii
  walkBass(17, [38, 41, 43, 45]);               // D2-F2-G2-A2
  block(17, [53, 57, 60, 62], 0, BAR, 60);     // F3-A3-C4-D4
  mel(17, 0, 77, HALF);                          // F5
  mel(17, 2, 74, HALF);                          // D5

  // Bar 18: G7 — V
  walkBass(18, [43, 45, 47, 43]);               // G2-A2-B2-G2
  block(18, [47, 50, 53, 55], 0, BAR, 60);     // B2-D3-F3-G3
  mel(18, 0, 74, HALF);                          // D5
  mel(18, 2, 71, HALF);                          // B4

  // Bar 19: Cmaj7 — I
  walkBass(19, [36, 40, 43, 40]);               // C2-E2-G2-E2
  block(19, [48, 52, 55, 59], 0, BAR, 60);     // C3-E3-G3-B3
  mel(19, 0, 72, BAR, 80);                      // C5 whole

  // Bar 20: Fmaj7 — IV
  walkBass(20, [41, 43, 45, 43]);               // F2-G2-A2-G2
  block(20, [53, 57, 60, 64], 0, BAR, 60);     // F3-A3-C4-E4
  mel(20, 0, 77, HALF);                          // F5
  mel(20, 2, 76, HALF);                          // E5

  // Bar 21: Em7 — iii
  walkBass(21, [40, 43, 45, 47]);               // E2-G2-A2-B2
  block(21, [52, 55, 59, 62], 0, BAR, 60);     // E3-G3-B3-D4
  mel(21, 0, 76, HALF);                          // E5
  mel(21, 2, 74, HALF);                          // D5

  // Bar 22: Dm7 — ii
  walkBass(22, [38, 40, 41, 43]);               // D2-E2-F2-G2
  block(22, [50, 53, 57, 60], 0, BAR, 60);     // D3-F3-A3-C4
  mel(22, 0, 74, QUARTER);                       // D5
  mel(22, 1, 72, QUARTER);                       // C5
  mel(22, 2, 69, HALF);                          // A4

  // Bar 23: G7 — V
  walkBass(23, [43, 41, 40, 38]);               // G2-F2-E2-D2 (descending)
  block(23, [47, 50, 53, 55], 0, BAR, 60);     // B2-D3-F3-G3
  mel(23, 0, 71, HALF);                          // B4
  mel(23, 2, 74, HALF);                          // D5

  // ═══════════════════════════════════════════════════════
  // Section C: To F major, then cadence back (bars 24-31)
  // ═══════════════════════════════════════════════════════

  // Bar 24: Cmaj7 → pivot to F
  arpeggio(24, 36, [48, 52, 55, 59]);           // C2, C3-E3-G3-B3
  mel(24, 0, 72, HALF);                          // C5
  mel(24, 2, 69, HALF);                          // A4

  // Bar 25: Fmaj7 — I/F
  arpeggio(25, 29, [41, 45, 48, 52]);           // F1, F2-A2-C3-E3
  mel(25, 0, 77, HALF);                          // F5
  mel(25, 2, 76, HALF);                          // E5

  // Bar 26: Bbmaj7 — IV/F
  arpeggio(26, 34, [46, 50, 53, 57]);           // Bb1, Bb2-D3-F3-A3
  mel(26, 0, 74, HALF);                          // D5
  mel(26, 2, 77, HALF);                          // F5

  // Bar 27: Gm7 — ii/F
  arpeggio(27, 31, [43, 46, 50, 53]);           // G1, G2-Bb2-D3-F3
  mel(27, 0, 79, HALF);                          // G5
  mel(27, 2, 77, QUARTER);                       // F5
  mel(27, 3, 74, QUARTER);                       // D5

  // Bar 28: C7 — V/F (dominant to resolve)
  arpeggio(28, 36, [48, 52, 55, 58]);           // C2, C3-E3-G3-Bb3
  mel(28, 0, 76, HALF);                          // E5
  mel(28, 2, 72, HALF);                          // C5

  // Bar 29: Fmaj7 — I/F
  arpeggio(29, 29, [41, 45, 48, 52]);           // F1, F2-A2-C3-E3
  mel(29, 0, 77, BAR);                           // F5 whole

  // Bar 30: Dm7 → G7 (ii-V back to C) — half bar each, block chords
  block(30, [38, 50, 53, 57, 60], 0, HALF, 75); // D2-D3-F3-A3-C4
  mel(30, 0, 74, QUARTER);                       // D5
  mel(30, 1, 77, QUARTER);                       // F5
  block(30, [43, 47, 50, 53, 55], 2, HALF, 75); // G2-B2-D3-F3-G3
  mel(30, 2, 79, QUARTER);                       // G5
  mel(30, 3, 77, QUARTER);                       // F5

  // Bar 31: Cmaj7 — I (final resolution)
  block(31, [36, 48, 52, 55, 59], 0, BAR, 80);  // C2-C3-E3-G3-B3
  mel(31, 0, 72, BAR, 85);                       // C5 whole note

  return notes;
}

function createDefaultProject(): Project {
  const trackId = generateId();
  const clipId = generateId();
  return {
    name: 'Demo — Arpeggios & Modulation',
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
