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
