/**
 * Music theory utilities: scales, chord detection, note naming.
 */

// Scale interval patterns (semitones from root)
export const SCALE_PATTERNS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  'natural minor': [0, 2, 3, 5, 7, 8, 10],
  'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
  'melodic minor': [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
};

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export const ROOT_OPTIONS = NOTE_NAMES.map((name, i) => ({ name, value: i }));

export function pitchToNoteName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  const note = NOTE_NAMES[pitch % 12];
  return `${note}${octave}`;
}

export function pitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}

export function isInScale(pitch: number, root: number, mode: string): boolean {
  const pattern = SCALE_PATTERNS[mode];
  if (!pattern) return true; // unknown scale = all notes valid
  const pc = pitchClass(pitch - root);
  return pattern.includes(pc);
}

export function getScaleNotes(root: number, mode: string): number[] {
  const pattern = SCALE_PATTERNS[mode] ?? SCALE_PATTERNS.major;
  return pattern.map((interval) => (root + interval) % 12);
}

/**
 * Get the scale degree of a pitch (1-7, or 0 if not in scale).
 */
export function getScaleDegree(pitch: number, root: number, mode: string): number {
  const pattern = SCALE_PATTERNS[mode];
  if (!pattern) return 0;
  const pc = pitchClass(pitch - root);
  const idx = pattern.indexOf(pc);
  return idx >= 0 ? idx + 1 : 0;
}

/**
 * Check if a pitch is the root of the current key.
 */
export function isRoot(pitch: number, root: number): boolean {
  return pitchClass(pitch) === pitchClass(root);
}

/**
 * Default scale degree name for each semitone distance from the key root.
 * All degrees are relative to the MAJOR scale — accidentals show deviation.
 * e.g. in C minor, Eb = "b3", Bb = "b7"
 */
const DEGREE_NAMES_DEFAULT: Record<number, string> = {
  0: '1',
  1: 'b2',
  2: '2',
  3: 'b3',
  4: '3',
  5: '4',
  6: 'b5', // default; #4 in Lydian or secondary dominant context
  7: '5',
  8: 'b6', // default; #5 in augmented context
  9: '6',
  10: 'b7',
  11: '7',
};

/** Alternate sharp interpretation for ambiguous semitone distances. */
const DEGREE_NAMES_SHARP: Record<number, string> = {
  6: '#4',
  8: '#5',
  3: '#2', // rare, but exists in augmented contexts
};

/**
 * Get the scale degree name with accidentals, relative to the major scale of keyRoot.
 *
 * Uses chord context to disambiguate ambiguous cases:
 * - 6 semitones: b5 vs #4 — if chord tone label suggests sharp (e.g. note is "3" of a secondary dom), use #4
 * - 8 semitones: b6 vs #5 — if chord is augmented quality, use #5
 * - 3 semitones: b3 vs #2 — almost always b3, #2 only in augmented context
 *
 * @param pitch - MIDI pitch
 * @param keyRoot - Key root (0-11)
 * @param chordToneLabel - Optional chord tone label from chordToneMap (e.g. "R", "3", "b5")
 */
export function getScaleDegreeName(
  pitch: number,
  keyRoot: number,
  chordToneLabel?: string,
): string {
  const semitones = ((pitchClass(pitch) - keyRoot) % 12 + 12) % 12;

  // For ambiguous intervals, use chord context to decide sharp vs flat
  if (chordToneLabel && DEGREE_NAMES_SHARP[semitones]) {
    // If the chord tone label itself uses a sharp (#), prefer sharp interpretation.
    // If it's a plain major interval (like "3" or "5") in a chord whose root
    // is not diatonic, the note is likely a raised degree.
    // Heuristic: if chord tone label does NOT start with "b", lean toward sharp.
    const label = chordToneLabel;
    if (label.includes('#') || (semitones === 6 && !label.startsWith('b') && label !== 'R')) {
      return DEGREE_NAMES_SHARP[semitones];
    }
  }

  return DEGREE_NAMES_DEFAULT[semitones] ?? '?';
}
