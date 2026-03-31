/**
 * Chord detection for the Chord Track.
 *
 * Uses the perceptual chord boundary algorithm (chordBoundary.ts) to segment
 * notes into chord regions, then names each chord using tonal.js disambiguation.
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
  chordComplexityScore,
  getChordToneLabel,
  chordToRomanNumeral,
} from './chordAnalysis';
import { generateId } from './id';
import { detectChordBoundaries, type ChordSegment } from './chordBoundary';

// ─── Chord symbol extraction ──────────────────────────────

/**
 * Extract chord quality suffix directly from a tonal.js chord name,
 * then apply jazz notation polish.
 *
 * e.g. "Cmaj7" -> "maj7", "D#m7b5" -> "m7b5", "Bdim7" -> "dim7", "G7" -> "7"
 */
function extractQualityFromName(chordName: string, root: string): string {
  // chordName might contain a slash for inversions: "Cmaj7/E"
  const slashIdx = chordName.indexOf('/');
  const base = slashIdx >= 0 ? chordName.slice(0, slashIdx) : chordName;

  // Strip the root (which may be like "C", "C#", "Db", "F#", etc.)
  let q = base.startsWith(root) ? base.slice(root.length) : base;

  return q;
}

// ─── Helper: analyze chord from a ChordSegment ─────────────

type SegmentChordResult = {
  root: string;
  rootPc: number;
  quality: string;
  bass: number | undefined;
};

/**
 * Analyze a ChordSegment to determine chord name, root, quality, and bass.
 * Returns null if the segment can't be identified as a chord.
 *
 * When the full PC set gives a non-bass-rooted chord (common when melody
 * notes contaminate the harmony), tries dropping PCs to find a simpler
 * bass-rooted interpretation. E.g., {C,E,G,A,B} with bass C → Am9/C,
 * but dropping A gives {C,E,G,B} → Cmaj7 (bass-rooted, preferred).
 */
function analyzeChordSegment(seg: ChordSegment): SegmentChordResult | null {
  // Sort PCs by weight descending so we can prioritize dropping low-weight PCs
  const sortedPcs = [...seg.pcs]
    .map(pc => ({ pc, weight: seg.pcWeights[pc] }))
    .sort((a, b) => b.weight - a.weight);

  const pitchClasses = sortedPcs.map(p => PITCH_CLASS_NAMES[p.pc]);
  if (pitchClasses.length < 2) return null;

  const bassName = PITCH_CLASS_NAMES[seg.bassPc];

  // Try full set first
  let result = detectWithFallback(pitchClasses, bassName);
  let chordName = result.chordName;
  if (!chordName) return null;

  // If detected root != bass and we have enough PCs, try dropping
  // low-weight non-bass PCs to find a bass-rooted chord.
  // This removes melody/passing tones that confuse the harmony.
  let parsed = Chord.get(chordName);
  if (parsed.tonic && parsed.tonic !== bassName && pitchClasses.length > 3) {
    let bestBassRootedName: string | null = null;
    let bestScore = Infinity;

    // Try dropping each non-bass PC, starting from lowest weight
    for (let i = pitchClasses.length - 1; i >= 0; i--) {
      if (pitchClasses[i] === bassName) continue;
      const subset = pitchClasses.filter((_, idx) => idx !== i);
      if (subset.length < 2) continue;
      const sub = detectWithFallback(subset, bassName);
      if (sub.chordName) {
        const subParsed = Chord.get(sub.chordName);
        if (subParsed.tonic === bassName) {
          const score = chordComplexityScore(sub.chordName);
          if (score < bestScore) {
            bestBassRootedName = sub.chordName;
            bestScore = score;
          }
        }
      }
    }

    if (bestBassRootedName) {
      chordName = bestBassRootedName;
      parsed = Chord.get(chordName);
    }
  }

  let root = parsed.tonic ?? null;
  let chordType = parsed.type ?? null;
  let bass: number | undefined;

  if (!root) return null;

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
  if (rootPc < 0) return null;

  // Determine bass for slash chords
  if (bass === undefined && bassName !== root) {
    bass = PITCH_CLASS_NAMES.indexOf(bassName);
    if (bass < 0) bass = undefined;
  }

  const quality = extractQualityFromName(chordName, root);

  return { root, rootPc, quality, bass };
}

/**
 * Check if a chord segment contains a 7th relative to the given root PC.
 * Uses the segment's pitch class set directly (no need for actual pitches).
 */
function segmentHas7th(seg: ChordSegment, rootPc: number): boolean {
  return seg.pcs.has((rootPc + 10) % 12) || seg.pcs.has((rootPc + 11) % 12);
}

// ─── Chord detection from chord boundary segments ───────────

/**
 * Detect chords from notes using perceptual chord boundary detection.
 *
 * Returns detected ChordEvents (source: 'detected') with memberNoteIds.
 */
export function detectChordsFromNotes(
  notes: Note[],
  ticksPerBeat: number,
): ChordEvent[] {
  const simpleNotes = notes.map(n => ({
    pitch: n.pitch,
    startTick: n.startTick,
    duration: n.duration,
  }));

  const segments = detectChordBoundaries(simpleNotes, ticksPerBeat);
  const results: ChordEvent[] = [];

  for (const seg of segments) {
    const chordInfo = analyzeChordSegment(seg);
    if (!chordInfo) continue;

    const { root, rootPc, quality, bass } = chordInfo;
    const has7th = segmentHas7th(seg, rootPc);

    // Find member notes (notes overlapping this segment)
    const memberNoteIds: string[] = [];
    let segNoteCount = 0;
    for (const note of notes) {
      const noteEnd = note.startTick + note.duration;
      if (note.startTick < seg.endTick && noteEnd > seg.startTick) {
        segNoteCount++;
        const label = getChordToneLabel(note.pitch, root, has7th);
        if (label !== '?') {
          memberNoteIds.push(note.id);
        }
      }
    }

    results.push({
      id: generateId(),
      startTick: seg.startTick,
      endTick: seg.endTick,
      root: rootPc,
      quality,
      bass,
      source: 'detected',
      confidence: segNoteCount > 0 ? memberNoteIds.length / segNoteCount : 0,
      memberNoteIds,
    });
  }

  return results;
}

// ─── Chord tone map from chord boundary segments ────────────

/**
 * Build a noteId -> chord tone label map using chord boundary detection.
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

  const simpleNotes = stableNotes.map(n => ({
    pitch: n.pitch,
    startTick: n.startTick,
    duration: n.duration,
  }));

  const segments = detectChordBoundaries(simpleNotes, ticksPerBeat);
  const map = new Map<string, string>();

  // For each segment, detect chord and label overlapping notes
  for (const seg of segments) {
    const chordInfo = analyzeChordSegment(seg);
    if (!chordInfo) continue;

    const { root, rootPc } = chordInfo;
    const has7th = segmentHas7th(seg, rootPc);

    for (const note of stableNotes) {
      const noteEnd = note.startTick + note.duration;
      if (note.startTick < seg.endTick && noteEnd > seg.startTick) {
        map.set(note.id, getChordToneLabel(note.pitch, root, has7th));
      }
    }
  }

  // Label dragging note against its overlapping segment's chord
  if (draggingNoteId) {
    const draggingNote = notes.find((n) => n.id === draggingNoteId);
    if (draggingNote) {
      for (const seg of segments) {
        if (draggingNote.startTick < seg.endTick &&
            draggingNote.startTick + draggingNote.duration > seg.startTick) {
          const chordInfo = analyzeChordSegment(seg);
          if (!chordInfo) break;
          const { root, rootPc } = chordInfo;
          const has7th = segmentHas7th(seg, rootPc);
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
 * Convert pre-detected ChordEvents to ChordInfo[] for key detection.
 * Key detection only needs root (string) and chordType fields.
 */
export function toChordInfoForKeyDetect(
  chords: ChordEvent[],
): ChordInfo[] {
  return chords.map((c) => ({
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
 * Build chord display labels from pre-detected ChordEvents.
 * Each label has a startTick position, a chord name, and a Roman numeral.
 */
export function buildChordLabels(
  chords: ChordEvent[],
  scaleRoot: number,
  regions?: { startTick: number; endTick: number; bestKey: { root: number } }[],
): ChordLabel[] {
  return chords.map((c) => {
    const rootName = PITCH_CLASS_NAMES[c.root];
    const bassStr = c.bass !== undefined ? '/' + PITCH_CLASS_NAMES[c.bass] : '';
    const name = rootName + c.quality + bassStr;
    // Use per-region key if available, otherwise fall back to global scaleRoot
    let localRoot = scaleRoot;
    if (regions) {
      for (const r of regions) {
        if (c.startTick >= r.startTick && c.startTick < r.endTick) {
          localRoot = r.bestKey.root;
          break;
        }
      }
    }
    const roman = chordToRomanNumeral(
      rootName,
      c.quality,
      c.bass !== undefined ? PITCH_CLASS_NAMES[c.bass] : null,
      localRoot,
    );
    return { startTick: c.startTick, name, roman };
  });
}
