/**
 * Overlap-based chord detection for the Chord Track.
 *
 * Unlike chordAnalysis.ts (per-measure, for note badges), this module
 * groups notes by temporal overlap and detects chords from each group.
 *
 * Reuses the chord disambiguation system from chordAnalysis.ts:
 * detectWithFallback, pickBestChord, chordComplexityScore.
 */

import { Chord } from 'tonal';
import type { Note } from '../types/model';
import type { ChordEvent } from '../types/model';
import {
  PITCH_CLASS_NAMES,
  detectWithFallback,
  chordHas7th,
  getChordToneLabel,
  chordToRomanNumeral,
} from './chordAnalysis';
import { generateId } from './id';

// ─── Chord symbol extraction ──────────────────────────────

/**
 * Extract chord quality suffix directly from a tonal.js chord name,
 * then apply jazz notation polish (° for dim, ø for half-dim).
 *
 * e.g. "Cmaj7" → "maj7", "D#m7b5" → "ø7", "Bdim7" → "°7", "G7" → "7"
 */
function extractQualityFromName(chordName: string, root: string): string {
  // chordName might contain a slash for inversions: "Cmaj7/E"
  const slashIdx = chordName.indexOf('/');
  const base = slashIdx >= 0 ? chordName.slice(0, slashIdx) : chordName;

  // Strip the root (which may be like "C", "C#", "Db", "F#", etc.)
  let q = base.startsWith(root) ? base.slice(root.length) : base;

  return q;
}

// ─── Note grouping by temporal overlap ─────────────────────

type NoteGroup = {
  notes: Note[];
  startTick: number;
  endTick: number;
};

/**
 * Group notes by temporal overlap.
 *
 * Two notes are in the same chord group if their temporal overlap
 * is >= overlapThreshold of the shorter note's duration.
 *
 * On-beat / off-beat weighting:
 * - Notes starting on a beat boundary: always included (even if short)
 * - Notes starting off-beat: only included if they sustain to the next beat
 */
function groupNotesByOverlap(
  notes: Note[],
  ticksPerBeat: number,
  overlapThreshold = 0.5,
): NoteGroup[] {
  if (notes.length === 0) return [];

  // Sort by startTick, then by pitch (low to high)
  const sorted = [...notes].sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);

  // Filter: off-beat notes must sustain to next beat
  const filtered = sorted.filter((note) => {
    const isOnBeat = note.startTick % ticksPerBeat === 0;
    if (isOnBeat) return true; // on-beat: always include, even if staccato

    // off-beat: must sustain to the next beat
    const nextBeat = (Math.floor(note.startTick / ticksPerBeat) + 1) * ticksPerBeat;
    const noteEnd = note.startTick + note.duration;
    return noteEnd >= nextBeat;
  });

  if (filtered.length === 0) return [];

  // Greedy grouping: for each note, try to merge into the current group
  const groups: NoteGroup[] = [];
  let current: NoteGroup = {
    notes: [filtered[0]],
    startTick: filtered[0].startTick,
    endTick: filtered[0].startTick + filtered[0].duration,
  };

  for (let i = 1; i < filtered.length; i++) {
    const note = filtered[i];
    const noteEnd = note.startTick + note.duration;

    // Compute overlap with the current group's time range
    const overlapStart = Math.max(note.startTick, current.startTick);
    const overlapEnd = Math.min(noteEnd, current.endTick);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    const shorterDuration = Math.min(note.duration, current.endTick - current.startTick);

    if (shorterDuration > 0 && overlap / shorterDuration >= overlapThreshold) {
      // Merge into current group
      current.notes.push(note);
      current.startTick = Math.min(current.startTick, note.startTick);
      current.endTick = Math.max(current.endTick, noteEnd);
    } else {
      // Start new group
      groups.push(current);
      current = {
        notes: [note],
        startTick: note.startTick,
        endTick: noteEnd,
      };
    }
  }
  groups.push(current);

  return groups;
}

// ─── Chord detection from note groups ─────────────────────

/**
 * Detect chords from notes using temporal overlap grouping.
 *
 * Returns detected ChordEvents (source: 'detected') with memberNoteIds.
 * Only groups with >= 2 unique pitch classes produce a chord.
 */
export function detectChordsFromNotes(
  notes: Note[],
  ticksPerBeat: number,
): ChordEvent[] {
  const groups = groupNotesByOverlap(notes, ticksPerBeat);
  const results: ChordEvent[] = [];

  for (const group of groups) {
    // Unique pitch classes
    const pitchClasses = [
      ...new Set(group.notes.map((n) => PITCH_CLASS_NAMES[((n.pitch % 12) + 12) % 12])),
    ];

    // Need at least 2 different pitch classes for a chord
    if (pitchClasses.length < 2) continue;

    // Find bass note (lowest pitch)
    const bassNote = group.notes.reduce((low, n) => (n.pitch < low.pitch ? n : low), group.notes[0]);
    const bassName = PITCH_CLASS_NAMES[((bassNote.pitch % 12) + 12) % 12];

    // Detect chord using existing disambiguation system
    const { chordName } = detectWithFallback(pitchClasses, bassName);
    if (!chordName) continue;

    const parsed = Chord.get(chordName);
    let root = parsed.tonic ?? null;
    let chordType = parsed.type ?? null;
    let bass: number | undefined;

    if (!root) continue;

    // Handle m#5 reinterpretation (same logic as chordAnalysis.ts)
    if (chordType && (chordType.toLowerCase().includes('m#5') || chordType.toLowerCase() === 'augmented minor')) {
      const rootIdx = PITCH_CLASS_NAMES.indexOf(root);
      if (rootIdx >= 0) {
        const majorRoot = PITCH_CLASS_NAMES[(rootIdx + 8) % 12];
        bass = rootIdx;
        root = majorRoot;
        chordType = 'major';
      }
    }

    const rootPc = PITCH_CLASS_NAMES.indexOf(root);
    if (rootPc < 0) continue;

    // Determine bass for slash chords
    if (bass === undefined && bassName !== root) {
      bass = PITCH_CLASS_NAMES.indexOf(bassName);
      if (bass < 0) bass = undefined;
    }

    // Extract quality suffix directly from tonal.js chord name
    // e.g. "Cmaj7" → "maj7", "Dm7b5" → "ø7" (with jazz symbols)
    const quality = extractQualityFromName(chordName, root);

    // Label member notes with chord tones
    const has7th = chordHas7th(group.notes.map((n) => n.pitch), root);
    const memberNoteIds: string[] = [];
    for (const note of group.notes) {
      const label = getChordToneLabel(note.pitch, root, has7th);
      // Include notes that have a meaningful chord function (not '?')
      if (label !== '?') {
        memberNoteIds.push(note.id);
      }
    }

    results.push({
      id: generateId(),
      startTick: group.startTick,
      endTick: group.endTick,
      root: rootPc,
      quality,
      bass,
      source: 'detected',
      confidence: memberNoteIds.length / group.notes.length,
      memberNoteIds,
    });
  }

  return results;
}

// ─── Chord tone map from overlap groups ───────────────────

/**
 * Build a noteId -> chord tone label map using overlap-based grouping.
 * Replaces the per-measure buildChordToneMap for more accurate labeling.
 *
 * When draggingNoteId is provided, that note is excluded from detection
 * but still labeled against the chord detected from the other notes.
 */
export function buildOverlapChordToneMap(
  notes: Note[],
  ticksPerBeat: number,
  draggingNoteId?: string | null,
): Map<string, string> {
  const stableNotes = draggingNoteId
    ? notes.filter((n) => n.id !== draggingNoteId)
    : notes;

  const groups = groupNotesByOverlap(stableNotes, ticksPerBeat);
  const map = new Map<string, string>();

  for (const group of groups) {
    const pitchClasses = [
      ...new Set(group.notes.map((n) => PITCH_CLASS_NAMES[((n.pitch % 12) + 12) % 12])),
    ];
    if (pitchClasses.length < 2) continue;

    const bassNote = group.notes.reduce((low, n) => (n.pitch < low.pitch ? n : low), group.notes[0]);
    const bassName = PITCH_CLASS_NAMES[((bassNote.pitch % 12) + 12) % 12];
    const { chordName } = detectWithFallback(pitchClasses, bassName);
    if (!chordName) continue;

    const parsed = Chord.get(chordName);
    let root = parsed.tonic ?? null;
    const chordType = parsed.type ?? null;
    if (!root) continue;

    if (chordType && (chordType.toLowerCase().includes('m#5') || chordType.toLowerCase() === 'augmented minor')) {
      const rootIdx = PITCH_CLASS_NAMES.indexOf(root);
      if (rootIdx >= 0) root = PITCH_CLASS_NAMES[(rootIdx + 8) % 12];
    }

    const has7th = chordHas7th(group.notes.map((n) => n.pitch), root);
    for (const note of group.notes) {
      map.set(note.id, getChordToneLabel(note.pitch, root, has7th));
    }
  }

  // Label dragging note against its overlapping group
  if (draggingNoteId) {
    const draggingNote = notes.find((n) => n.id === draggingNoteId);
    if (draggingNote) {
      // Find which group overlaps this note's time
      for (const group of groups) {
        if (draggingNote.startTick < group.endTick &&
            draggingNote.startTick + draggingNote.duration > group.startTick) {
          const pitchClasses = [
            ...new Set(group.notes.map((n) => PITCH_CLASS_NAMES[((n.pitch % 12) + 12) % 12])),
          ];
          if (pitchClasses.length < 2) break;
          const bassNote = group.notes.reduce((low, n) => (n.pitch < low.pitch ? n : low), group.notes[0]);
          const bassName = PITCH_CLASS_NAMES[((bassNote.pitch % 12) + 12) % 12];
          const { chordName } = detectWithFallback(pitchClasses, bassName);
          if (!chordName) break;
          const parsed = Chord.get(chordName);
          let root = parsed.tonic ?? null;
          const chordType = parsed.type ?? null;
          if (!root) break;
          if (chordType && (chordType.toLowerCase().includes('m#5') || chordType.toLowerCase() === 'augmented minor')) {
            const rootIdx = PITCH_CLASS_NAMES.indexOf(root);
            if (rootIdx >= 0) root = PITCH_CLASS_NAMES[(rootIdx + 8) % 12];
          }
          const has7th = chordHas7th(group.notes.map((n) => n.pitch), root);
          map.set(draggingNoteId, getChordToneLabel(draggingNote.pitch, root, has7th));
          break;
        }
      }
    }
  }

  return map;
}

// ─── Convert to ChordInfo for key detection ───────────────

import type { ChordInfo } from './chordAnalysis';

/**
 * Convert overlap-based ChordEvents to ChordInfo[] for key detection.
 * Key detection only needs root (string) and chordType fields.
 */
export function toChordInfoForKeyDetect(
  notes: Note[],
  ticksPerBeat: number,
): ChordInfo[] {
  const detected = detectChordsFromNotes(notes, ticksPerBeat);
  return detected.map((c) => ({
    measure: 0,
    startTick: c.startTick,
    endTick: c.endTick,
    chordName: PITCH_CLASS_NAMES[c.root] + c.quality,
    root: PITCH_CLASS_NAMES[c.root],
    chordType: c.quality || 'major',
    bass: c.bass !== undefined ? PITCH_CLASS_NAMES[c.bass] : null,
    noteFunctions: new Map(),
  }));
}

// ─── Chord labels for NoteLayer display ───────────────────

export type ChordLabel = {
  startTick: number;
  name: string;
  roman: string;
};

/**
 * Build chord display labels from overlap-based detection.
 * Each label has a startTick position (where the label should appear),
 * a chord name, and a Roman numeral.
 */
export function buildChordLabels(
  notes: Note[],
  ticksPerBeat: number,
  scaleRoot: number,
): ChordLabel[] {
  const detected = detectChordsFromNotes(notes, ticksPerBeat);
  return detected.map((c) => {
    const rootName = PITCH_CLASS_NAMES[c.root];
    const bassStr = c.bass !== undefined ? '/' + PITCH_CLASS_NAMES[c.bass] : '';
    const name = rootName + c.quality + bassStr;
    const roman = chordToRomanNumeral(
      rootName,
      c.quality,
      c.bass !== undefined ? PITCH_CLASS_NAMES[c.bass] : null,
      scaleRoot,
    );
    return { startTick: c.startTick, name, roman };
  });
}
