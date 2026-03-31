/**
 * Per-measure chord analysis using tonal.js.
 *
 * Rules:
 * - Analyze per measure (bar)
 * - Only notes with duration >= half the measure length are included
 *   (shorter notes are treated as passing tones)
 * - Each note is labeled with its chord function (R, 3, 5, 7, etc.)
 */

import { Chord, Note as TonalNote } from 'tonal';
import type { Note } from '../types/model';

export type ChordInfo = {
  /** Measure number (0-indexed) */
  measure: number;
  /** Start tick of this measure */
  startTick: number;
  /** End tick of this measure */
  endTick: number;
  /** Display chord name, e.g. "Cmaj7", "Dm/F", includes slash for inversions */
  chordName: string | null;
  /** Chord root as pitch class name, e.g. "C", "D" */
  root: string | null;
  /** Chord type, e.g. "maj7", "m" */
  chordType: string | null;
  /** Bass note name if different from root (for slash chords) */
  bass: string | null;
  /** Map of noteId -> chord tone label ("R", "3", "5", "7", "b3", etc.) */
  noteFunctions: Map<string, string>;
};

export const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Get the interval label for a note relative to the chord root.
 *
 * Extension naming rule (standard music theory):
 * - When the chord contains a 7th (b7 or 7): 2→9, b2→b9, 4→11, 6→13
 * - When the chord has NO 7th: 2→2, 4→4, 6→6 (e.g., Cadd2, Csus4, C6)
 */
export function getChordToneLabel(notePitch: number, rootName: string, has7th: boolean): string {
  const noteName = PITCH_CLASS_NAMES[((notePitch % 12) + 12) % 12];
  const rootMidi = TonalNote.midi(rootName + '4');
  const noteMidi = TonalNote.midi(noteName + '4');
  if (rootMidi == null || noteMidi == null) return '?';

  const semitones = ((noteMidi - rootMidi) % 12 + 12) % 12;

  switch (semitones) {
    case 0: return 'R';
    case 1: return has7th ? 'b9' : 'b2';
    case 2: return has7th ? '9' : '2';
    case 3: return 'b3';
    case 4: return '3';
    case 5: return has7th ? '11' : '4';
    case 6: return 'b5';
    case 7: return '5';
    case 8: return '#5';
    case 9: return has7th ? '13' : '6';
    case 10: return 'b7';
    case 11: return '7';
    default: return '?';
  }
}

/**
 * Check if a set of pitch classes (relative to root) contains a 7th (b7 or maj7).
 */
export function chordHas7th(notePitches: number[], rootName: string): boolean {
  const rootMidi = TonalNote.midi(rootName + '4');
  if (rootMidi == null) return false;
  for (const pitch of notePitches) {
    const semitones = ((pitch - rootMidi) % 12 + 12) % 12;
    if (semitones === 10 || semitones === 11) return true; // b7 or 7
  }
  return false;
}

/**
 * Score a chord name for "naturalness" — lower is better.
 * Prefers common chord types that match how musicians think.
 */
export function chordComplexityScore(chordName: string): number {
  const parsed = Chord.get(chordName);
  const type = (parsed.type ?? '').toLowerCase();

  // Prefer root-position detection (no slash in raw tonal output)
  const hasSlash = chordName.includes('/');
  const slashPenalty = hasSlash ? 50 : 0;

  // Score by chord type simplicity
  let typeScore: number;
  if (type === 'major' || type === '' || type === 'minor') {
    typeScore = 0; // triads are simplest
  } else if (type === '7' || type === 'maj7' || type === 'm7' || type === 'dominant seventh') {
    typeScore = 10; // common 7th chords
  } else if (type === 'sus4' || type === 'sus2') {
    typeScore = 15;
  } else if (type === 'dim' || type === 'diminished' || type === 'dim7' || type === 'diminished seventh') {
    typeScore = 20;
  } else if (type === 'aug' || type === 'augmented') {
    typeScore = 25;
  } else if (type === 'm7b5' || type === 'half-diminished') {
    typeScore = 22;
  } else if (type.includes('#5') || type.includes('b5')) {
    typeScore = 30; // altered chords — usually not what the ear hears first
  } else if (type.includes('add') || type.includes('9') || type.includes('11') || type.includes('13')) {
    typeScore = 18; // extensions
  } else {
    typeScore = 35; // exotic
  }

  // Penalize longer names (often means more exotic interpretation)
  const lengthPenalty = chordName.length;

  return slashPenalty + typeScore + lengthPenalty;
}

/**
 * Pick the most musically intuitive chord from tonal.js detection results.
 *
 * Strategy:
 * 1. Filter out musically invalid interpretations (e.g. sus when 3rd is present)
 * 2. If any detected chord has the bass note as its root, strongly prefer it
 * 3. Among those, pick the simplest chord type
 */
export function pickBestChord(detected: string[], bassName: string, pitchClasses?: string[]): string | null {
  if (detected.length === 0) return null;

  // Filter out invalid interpretations based on actual pitch content
  let filtered = detected;
  if (pitchClasses && pitchClasses.length > 0) {
    filtered = detected.filter((name) => {
      const parsed = Chord.get(name);
      const type = (parsed.type ?? '').toLowerCase();
      const tonic = parsed.tonic;

      // sus means the 3rd is REPLACED by 4th. If actual notes contain both
      // the 3rd and 4th relative to this chord's root, sus is wrong.
      if (tonic && (type.includes('sus4') || type.includes('sus2'))) {
        const rootMidi = TonalNote.midi(tonic + '4');
        if (rootMidi != null) {
          const intervals = new Set(
            pitchClasses.map((pc) => {
              const midi = TonalNote.midi(pc + '4');
              return midi != null ? ((midi - rootMidi) % 12 + 12) % 12 : -1;
            }),
          );
          const has3rd = intervals.has(4); // major 3rd
          const hasMinor3rd = intervals.has(3); // minor 3rd
          const has4th = intervals.has(5); // perfect 4th
          // If 3rd coexists with 4th, this is add4/add11/11, not sus4
          if ((has3rd || hasMinor3rd) && has4th) return false;
        }
      }
      return true;
    });
  }

  if (filtered.length === 0) filtered = detected; // fallback to unfiltered

  if (filtered.length === 1) return filtered[0];

  // Separate: chords where tonic matches bass vs. others
  const bassRootChords: string[] = [];
  const otherChords: string[] = [];

  for (const name of filtered) {
    const parsed = Chord.get(name);
    const tonic = parsed.tonic;
    if (tonic === bassName) {
      bassRootChords.push(name);
    } else {
      otherChords.push(name);
    }
  }

  // Prefer bass-root chords (root position from listener's perspective)
  const candidates = bassRootChords.length > 0 ? bassRootChords : otherChords;

  // Sort by complexity score, pick simplest
  candidates.sort((a, b) => chordComplexityScore(a) - chordComplexityScore(b));
  return candidates[0];
}

/**
 * Try to detect a chord from pitch classes. If the full set doesn't match
 * any known chord, progressively drop one pitch class at a time and retry.
 * This handles cases like Cmaj7 + F (11th) where tonal.js can't name the
 * full set but can recognize the core Cmaj7.
 *
 * Returns the best chord name found and which pitch classes were used.
 */
export function detectWithFallback(
  pitchClasses: string[],
  bassName: string,
): { chordName: string | null; usedPitchClasses: string[] } {
  // Try the full set first
  const fullDetected = Chord.detect(pitchClasses);
  const fullBest = pickBestChord(fullDetected, bassName, pitchClasses);
  if (fullBest) {
    return { chordName: fullBest, usedPitchClasses: pitchClasses };
  }

  // Single note = just a note, not a chord
  if (pitchClasses.length <= 1) {
    return { chordName: null, usedPitchClasses: pitchClasses };
  }

  // Drop one pitch class at a time, prefer dropping non-bass notes.
  // Try all single-drop combinations, pick the result with the lowest complexity score.
  let bestResult: { chordName: string; usedPitchClasses: string[]; score: number } | null = null;

  for (let i = 0; i < pitchClasses.length; i++) {
    const subset = pitchClasses.filter((_, idx) => idx !== i);
    const detected = Chord.detect(subset);
    const best = pickBestChord(detected, bassName, pitchClasses);
    if (best) {
      const score = chordComplexityScore(best);
      // Penalize dropping the bass note
      const dropPenalty = pitchClasses[i] === bassName ? 100 : 0;
      const totalScore = score + dropPenalty;
      if (!bestResult || totalScore < bestResult.score) {
        bestResult = { chordName: best, usedPitchClasses: subset, score: totalScore };
      }
    }
  }

  if (bestResult) {
    return { chordName: bestResult.chordName, usedPitchClasses: bestResult.usedPitchClasses };
  }

  // If dropping one note didn't work and we have 4+ notes, try dropping two
  if (pitchClasses.length >= 4) {
    for (let i = 0; i < pitchClasses.length; i++) {
      for (let j = i + 1; j < pitchClasses.length; j++) {
        const subset = pitchClasses.filter((_, idx) => idx !== i && idx !== j);
        if (subset.length < 2) continue;
        const detected = Chord.detect(subset);
        const best = pickBestChord(detected, bassName, pitchClasses);
        if (best) {
          const score = chordComplexityScore(best);
          const dropPenalty = (pitchClasses[i] === bassName || pitchClasses[j] === bassName) ? 100 : 0;
          const totalScore = score + dropPenalty;
          if (!bestResult || totalScore < bestResult.score) {
            bestResult = { chordName: best, usedPitchClasses: subset, score: totalScore };
          }
        }
      }
    }
  }

  return bestResult
    ? { chordName: bestResult.chordName, usedPitchClasses: bestResult.usedPitchClasses }
    : { chordName: null, usedPitchClasses: pitchClasses };
}

/**
 * Analyze chords per measure.
 *
 * @param notes - All notes in the clip
 * @param ticksPerBeat - Ticks per beat (usually 480)
 * @param numerator - Time signature numerator (e.g. 4)
 * @param denominator - Time signature denominator (e.g. 4)
 * @param measureRange - Optional [startMeasure, endMeasure] to limit analysis
 */
export function analyzeChords(
  notes: Note[],
  ticksPerBeat: number,
  numerator: number,
  denominator: number,
  measureRange?: [number, number],
): ChordInfo[] {
  const ticksPerMeasure = ticksPerBeat * numerator * (4 / denominator);
  const halfMeasure = ticksPerMeasure / 2;

  // Determine measure range from notes
  if (notes.length === 0) return [];

  const maxTick = Math.max(...notes.map((n) => n.startTick + n.duration));
  const totalMeasures = Math.ceil(maxTick / ticksPerMeasure) + 1;

  const startM = measureRange ? measureRange[0] : 0;
  const endM = measureRange ? Math.min(measureRange[1], totalMeasures) : totalMeasures;

  const results: ChordInfo[] = [];

  for (let m = startM; m < endM; m++) {
    const mStart = m * ticksPerMeasure;
    const mEnd = mStart + ticksPerMeasure;

    // Find notes that overlap this measure AND have effective duration >= halfMeasure
    const chordNotes: Note[] = [];
    for (const note of notes) {
      const noteEnd = note.startTick + note.duration;
      // Must overlap the measure
      if (noteEnd <= mStart || note.startTick >= mEnd) continue;
      // Effective duration within this measure
      const overlapStart = Math.max(note.startTick, mStart);
      const overlapEnd = Math.min(noteEnd, mEnd);
      const effectiveDuration = overlapEnd - overlapStart;
      if (effectiveDuration >= halfMeasure) {
        chordNotes.push(note);
      }
    }

    const noteFunctions = new Map<string, string>();

    // Check if this measure has ANY notes at all (regardless of duration filter)
    let hasAnyNotes = false;
    for (const note of notes) {
      const noteEnd = note.startTick + note.duration;
      if (noteEnd > mStart && note.startTick < mEnd) {
        hasAnyNotes = true;
        break;
      }
    }

    if (chordNotes.length === 0) {
      results.push({
        measure: m,
        startTick: mStart,
        endTick: mEnd,
        // Empty measure = null (show nothing). Has notes but all too short = "N.C."
        chordName: hasAnyNotes ? 'N.C.' : null,
        root: null,
        chordType: null,
        bass: null,
        noteFunctions,
      });
      continue;
    }

    // Get unique pitch classes as note names
    const pitchClasses = [...new Set(chordNotes.map((n) => PITCH_CLASS_NAMES[((n.pitch % 12) + 12) % 12]))];

    // Find the actual bass note (lowest pitch in this measure)
    const bassNote = chordNotes.reduce((low, n) => n.pitch < low.pitch ? n : low, chordNotes[0]);
    const bassName = PITCH_CLASS_NAMES[((bassNote.pitch % 12) + 12) % 12];

    // Try to detect chord. If full set fails, try subsets (drop notes one at a time
    // starting from the least common pitch classes) to find the best core chord,
    // then label the extra notes as extensions.
    const { chordName: bestChord } = detectWithFallback(pitchClasses, bassName);

    let root: string | null = null;
    let chordType: string | null = null;
    let bass: string | null = null;
    let displayName: string | null = null;

    if (bestChord) {
      const parsed = Chord.get(bestChord);
      root = parsed.tonic ?? null;
      chordType = parsed.type ?? null;

      // Reinterpret m#5 as major first inversion:
      // Xm#5 (X, X+3, X+8) = (X+8)major / X
      // e.g. Am#5 (A,C,F) → F/A, Cm#5 (C,Eb,Ab) → Ab/C
      if (root && chordType && (chordType.toLowerCase().includes('m#5') || chordType.toLowerCase() === 'augmented minor')) {
        const rootIdx = PITCH_CLASS_NAMES.indexOf(root);
        if (rootIdx >= 0) {
          const majorRoot = PITCH_CLASS_NAMES[(rootIdx + 8) % 12];
          bass = root;
          root = majorRoot;
          chordType = 'major';
        }
      }

      // Strip any existing slash notation from tonal.js output before adding our own
      const chordBase = bass ? root : (bestChord.includes('/') ? bestChord.split('/')[0] : bestChord);

      // Determine if this is an inversion (bass != root)
      if (root && bass) {
        // Already set from m#5 reinterpretation or original detection
        displayName = `${root}/${bass}`;
      } else if (root && bassName !== root) {
        bass = bassName;
        displayName = `${chordBase}/${bassName}`;
      } else {
        displayName = chordBase;
      }

      // Check if chord contains a 7th — determines extension naming (9/11/13 vs 2/4/6)
      const has7th = root ? chordHas7th(chordNotes.map((n) => n.pitch), root) : false;

      // Label ALL chord notes with their function relative to the detected root
      // (including notes that were dropped during subset detection — they're extensions)
      for (const note of chordNotes) {
        if (root) {
          noteFunctions.set(note.id, getChordToneLabel(note.pitch, root, has7th));
        }
      }
    } else {
      // Could not detect any chord even with subsets
      displayName = 'N.C.';
    }

    results.push({
      measure: m,
      startTick: mStart,
      endTick: mEnd,
      chordName: displayName,
      root,
      chordType,
      bass,
      noteFunctions,
    });
  }

  return results;
}

/**
 * Build a lookup: noteId -> chord tone label.
 *
 * When draggingNoteId is provided, that note is excluded from chord detection
 * but still labeled using the chord detected from the OTHER notes in the same
 * measure. This way, while drawing a new note, the user sees what chord tone
 * it would be relative to the existing harmony.
 */
export function buildChordToneMap(
  notes: Note[],
  ticksPerBeat: number,
  numerator: number,
  denominator: number,
  draggingNoteId?: string | null,
): Map<string, string> {
  // If dragging, analyze without the dragging note
  const stableNotes = draggingNoteId
    ? notes.filter((n) => n.id !== draggingNoteId)
    : notes;
  const chords = analyzeChords(stableNotes, ticksPerBeat, numerator, denominator);

  const map = new Map<string, string>();
  for (const chord of chords) {
    for (const [noteId, label] of chord.noteFunctions) {
      map.set(noteId, label);
    }
  }

  // If there's a dragging note, label it using the chord in its measure
  if (draggingNoteId) {
    const draggingNote = notes.find((n) => n.id === draggingNoteId);
    if (draggingNote) {
      const ticksPerMeasure = ticksPerBeat * numerator * (4 / denominator);
      const measure = Math.floor(draggingNote.startTick / ticksPerMeasure);
      const chord = chords.find((c) => c.measure === measure);
      if (chord?.root) {
        const has7th = chordHas7th(
          stableNotes.filter((n) => {
            const noteEnd = n.startTick + n.duration;
            return noteEnd > chord.startTick && n.startTick < chord.endTick;
          }).map((n) => n.pitch),
          chord.root,
        );
        map.set(draggingNoteId, getChordToneLabel(draggingNote.pitch, chord.root, has7th));
      }
    }
  }

  return map;
}

/**
 * Roman numeral labels for scale degrees.
 * Uppercase = major/dominant, lowercase = minor/diminished.
 */
const ROMAN_UPPER = ['I', 'bII', 'II', 'bIII', 'III', 'IV', 'bV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
const ROMAN_LOWER = ['i', 'bii', 'ii', 'biii', 'iii', 'iv', 'bv', 'v', 'bvi', 'vi', 'bvii', 'vii'];

/**
 * Get Roman numeral for a chord relative to a key.
 *
 * Rules:
 * - Major/dominant/aug chords → uppercase (I, IV, V)
 * - Minor/diminished chords → lowercase (ii, iii, vi)
 * - Chord quality suffix is appended (7, maj7, dim, etc.)
 * - Slash bass is converted to Roman numeral too
 */
export function chordToRomanNumeral(
  chordRoot: string,
  chordType: string | null,
  bassNote: string | null,
  keyRoot: number, // 0-11
): string {
  const rootMidi = TonalNote.midi(chordRoot + '4');
  if (rootMidi == null) return '?';

  const semitones = ((rootMidi % 12) - keyRoot + 12) % 12;
  const type = (chordType ?? '').toLowerCase();

  // Determine if chord is major-family or minor-family
  const isMinorFamily = type.includes('minor') || type.includes('dim') ||
    type === 'm' || type === 'm7' || type === 'm9' || type === 'm11' ||
    type.startsWith('m') && !type.startsWith('maj');
  const isDim = type.includes('dim');
  const isAug = type.includes('aug') || type.includes('#5');

  const numeral = isMinorFamily ? ROMAN_LOWER[semitones] : ROMAN_UPPER[semitones];

  // Build quality suffix
  const isHalfDim = type.includes('m7b5') || type.includes('half-diminished') || type.includes('ø');
  let suffix = '';
  if (isHalfDim) {
    suffix = 'm7b5';
  } else if (isDim) {
    suffix = 'dim';
    if (type.includes('7')) suffix += '7';
  } else if (isAug) {
    suffix = '+';
  } else if (type.includes('maj7') || type.includes('major seventh')) {
    suffix = 'maj7';
  } else if (type.includes('7') || type.includes('dominant')) {
    suffix = '7';
  } else if (type.includes('sus4')) {
    suffix = 'sus4';
  } else if (type.includes('sus2')) {
    suffix = 'sus2';
  }
  // Don't duplicate "m" — it's already indicated by lowercase numeral

  let result = numeral + suffix;

  // Add slash bass as Roman numeral
  if (bassNote) {
    const bassMidi = TonalNote.midi(bassNote + '4');
    if (bassMidi != null) {
      const bassSemitones = ((bassMidi % 12) - keyRoot + 12) % 12;
      // Bass uses uppercase always (it's just a bass note, not a chord quality)
      result += '/' + ROMAN_UPPER[bassSemitones];
    }
  }

  return result;
}

/**
 * Resolution type between two consecutive chords.
 */
export type ResolutionInfo = {
  /** Measure where the resolving chord is (the "from" chord) — legacy */
  fromMeasure: number;
  /** Tick position of the "from" chord's start */
  fromTick: number;
  /** Tick position of the "from" chord's end */
  endTick: number;
  /** Tick position of the "to" chord's start (label is right-aligned before this) */
  toTick: number;
  /** Label to display, e.g. "V→I", "ii→V" */
  label: string;
  /** Resolution category for styling */
  type: 'dominant' | 'predominant' | 'tritone-sub' | 'deceptive';
};

/**
 * Detect resolution relationships between consecutive chords.
 * Purely interval-based — flags any root-down-a-fifth motion
 * regardless of key function. Catches jazz ii-V-I, secondary dominants, etc.
 *
 * Detects:
 * - Root descends P5 (dominant resolution pattern)
 * - Root descends semitone + dominant quality (tritone substitution)
 */
/** Helper: is this chord type minor-family? (includes half-diminished / m7b5) */
function isMinorType(type: string): boolean {
  const t = type.toLowerCase();
  return t.includes('minor') || t.includes('dim') ||
    t.includes('m7b5') || t.includes('half-diminished') ||
    t === 'm' || t === 'm7' || t === 'm9' || t === 'm11' ||
    (t.startsWith('m') && !t.startsWith('maj'));
}

/** Helper: is this chord type dominant-family (major/dom7)? */
function isDominantType(type: string): boolean {
  const t = type.toLowerCase();
  return t.includes('dominant') || t === '7' || t === '' || t === 'major' || t.includes('maj');
}

/** Helper: interval in semitones (ascending) between two pitch class indices */
function rootInterval(fromIdx: number, toIdx: number): number {
  return ((toIdx - fromIdx) % 12 + 12) % 12;
}

export function detectResolutions(
  chords: ChordInfo[],
  _keyRoot: number,
): ResolutionInfo[] {
  const results: ResolutionInfo[] = [];
  const validChords = chords.filter((c) => c.root != null && c.chordName != null && c.chordName !== 'N.C.');

  // Track which indices are consumed by ii-V-I (don't double-label as V→I)
  const consumed = new Set<number>();

  // Pass 1: detect ii-V-I triplets
  // ii = minor, V = dominant, I = major; each pair root-down-a-fifth
  for (let i = 0; i < validChords.length - 2; i++) {
    const ii = validChords[i];
    const v = validChords[i + 1];
    const one = validChords[i + 2];
    if (!ii.root || !v.root || !one.root) continue;

    const iiIdx = PITCH_CLASS_NAMES.indexOf(ii.root);
    const vIdx = PITCH_CLASS_NAMES.indexOf(v.root);
    const oneIdx = PITCH_CLASS_NAMES.indexOf(one.root);
    if (iiIdx < 0 || vIdx < 0 || oneIdx < 0) continue;

    const iiType = (ii.chordType ?? '').toLowerCase();
    const vType = (v.chordType ?? '').toLowerCase();

    // ii→V: fifth down, ii is minor
    // V→I: fifth down, V is dominant
    if (rootInterval(iiIdx, vIdx) === 5 && isMinorType(iiType) &&
        rootInterval(vIdx, oneIdx) === 5 && isDominantType(vType)) {
      // Mark both pairs as part of ii-V-I (use 'predominant' color to distinguish from standalone V→I)
      const isIiHalfDim = iiType.includes('m7b5') || iiType.includes('half-diminished');
      const iiSuffix = isIiHalfDim ? 'm7b5' : (iiType.includes('7') ? '7' : '');
      const vSuffix = vType.includes('7') || vType.includes('dominant') ? '7' : '';
      const oneType = (one.chordType ?? '').toLowerCase();
      const oneIsMinor = isMinorType(oneType);
      const target = oneIsMinor ? 'i' : 'I';
      results.push({
        fromMeasure: ii.measure,
        fromTick: ii.startTick,
        endTick: ii.endTick,
        toTick: v.startTick,
        label: `ii${iiSuffix}\u2192V`,
        type: 'predominant',
      });
      results.push({
        fromMeasure: v.measure,
        fromTick: v.startTick,
        endTick: v.endTick,
        toTick: one.startTick,
        label: `V${vSuffix}\u2192${target}`,
        type: 'predominant',
      });
      consumed.add(i);
      consumed.add(i + 1);
      i += 1;
      continue;
    }
  }

  // Pass 2: detect remaining pairwise resolutions (skip consumed pairs)
  for (let i = 0; i < validChords.length - 1; i++) {
    if (consumed.has(i)) continue;

    const from = validChords[i];
    const to = validChords[i + 1];
    if (!from.root || !to.root) continue;

    const fromIdx = PITCH_CLASS_NAMES.indexOf(from.root);
    const toIdx = PITCH_CLASS_NAMES.indexOf(to.root);
    if (fromIdx < 0 || toIdx < 0) continue;

    const interval = rootInterval(fromIdx, toIdx);
    const fromType = (from.chordType ?? '').toLowerCase();

    // Root descends a perfect 5th
    if (interval === 5) {
      const minor = isMinorType(fromType);
      const roman = minor ? 'v' : 'V';
      const suffix = fromType.includes('7') || fromType.includes('dominant') ? '7' : '';
      const toType = (to.chordType ?? '').toLowerCase();
      const target = isMinorType(toType) ? 'i' : 'I';
      results.push({
        fromMeasure: from.measure,
        fromTick: from.startTick,
        endTick: from.endTick,
        toTick: to.startTick,
        label: `${roman}${suffix}\u2192${target}`,
        type: 'dominant',
      });
      continue;
    }

    // Tritone substitution: root descends semitone, dominant-quality
    if (interval === 11 && isDominantType(fromType)) {
      const suffix = fromType.includes('7') || fromType.includes('dominant') ? '7' : '';
      const toType = (to.chordType ?? '').toLowerCase();
      const target = isMinorType(toType) ? 'i' : 'I';
      results.push({
        fromMeasure: from.measure,
        fromTick: from.startTick,
        endTick: from.endTick,
        toTick: to.startTick,
        label: `bII${suffix}\u2192${target}`,
        type: 'tritone-sub',
      });
      continue;
    }
  }

  return results;
}

/**
 * Build a lookup: measure number -> display string (chord name + Roman numeral).
 * For displaying chord names in the ruler or grid.
 */
export type MeasureChordLabel = {
  name: string;   // e.g. "Cmaj7", "Dm/F"
  roman: string;  // e.g. "I", "ii7", "" if no key
};

export function buildMeasureChordMap(
  notes: Note[],
  ticksPerBeat: number,
  numerator: number,
  denominator: number,
  keyRoot?: number,
): Map<number, MeasureChordLabel> {
  const chords = analyzeChords(notes, ticksPerBeat, numerator, denominator);
  const map = new Map<number, MeasureChordLabel>();
  for (const chord of chords) {
    if (chord.chordName) {
      const roman = (keyRoot != null && chord.root)
        ? chordToRomanNumeral(chord.root, chord.chordType, chord.bass, keyRoot)
        : '';
      map.set(chord.measure, { name: chord.chordName, roman });
    }
  }
  return map;
}
