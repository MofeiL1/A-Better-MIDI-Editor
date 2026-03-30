/**
 * Auto key detection: scores 72 candidate keys (12 roots x 6 modes)
 * based on note coverage + tonic chord presence.
 */

import { SCALE_PATTERNS, NOTE_NAMES } from './music';
import type { ChordInfo } from './chordAnalysis';
import type { Note } from '../types/model';

/** Modes we auto-detect, ordered by commonality (index = priority, lower = more common). */
const DETECT_MODES: string[] = [
  'major',
  'natural minor',
  'dorian',
  'mixolydian',
  'harmonic minor',
  'melodic minor',
];

/** Whether a mode's tonic chord is major-family. */
function tonicIsMajor(mode: string): boolean {
  return mode === 'major' || mode === 'mixolydian';
}

/**
 * Check if a detected chord is the tonic chord for a candidate key.
 * Major-family keys need a major/dominant chord on the root.
 * Minor-family keys need a minor chord on the root.
 */
function isTonicChord(chord: ChordInfo, candidateRoot: number, mode: string): boolean {
  if (!chord.root) return false;

  // Convert chord root name to pitch class number
  const rootIndex = NOTE_NAMES.indexOf(chord.root as typeof NOTE_NAMES[number]);
  if (rootIndex < 0 || rootIndex !== candidateRoot) return false;

  const type = (chord.chordType ?? '').toLowerCase();
  if (tonicIsMajor(mode)) {
    // Major/dominant chord on root
    return type === 'major' || type === '' || type === '5' ||
      type.includes('maj') || type.includes('dominant') ||
      type === '7' || type === 'sus4' || type === 'sus2';
  } else {
    // Minor chord on root
    return type === 'minor' || type === 'm' || type === 'm7' ||
      type.startsWith('m') && !type.startsWith('maj');
  }
}

/**
 * Detect the most likely key from a set of notes and their chord analysis.
 *
 * @param notes - All notes
 * @param chords - Result of analyzeChords() (reuse, don't re-compute)
 * @returns Best-matching key, or null if not enough data
 */
export function detectKey(
  notes: Note[],
  chords: ChordInfo[],
): { root: number; mode: string } | null {
  // Collect unique pitch classes
  const pcSet = new Set<number>();
  for (const n of notes) {
    pcSet.add(((n.pitch % 12) + 12) % 12);
  }
  if (pcSet.size < 3) return null;

  const uniquePCs = [...pcSet];
  const totalPCs = uniquePCs.length;

  type Candidate = {
    root: number;
    mode: string;
    fitScore: number;
    hasTonicChord: boolean;
    modeIndex: number;
  };

  const candidates: Candidate[] = [];

  for (let root = 0; root < 12; root++) {
    for (let mi = 0; mi < DETECT_MODES.length; mi++) {
      const mode = DETECT_MODES[mi];
      const pattern = SCALE_PATTERNS[mode];
      if (!pattern) continue;

      // Count how many of the music's pitch classes are in this scale
      const scaleSet = new Set(pattern.map((interval) => (root + interval) % 12));
      let inScale = 0;
      for (const pc of uniquePCs) {
        if (scaleSet.has(pc)) inScale++;
      }
      const fitScore = inScale / totalPCs;

      // Threshold: at least 70% of notes must be in-scale
      if (fitScore < 0.7) continue;

      // Check for tonic chord
      let hasTonicChord = false;
      for (const chord of chords) {
        if (isTonicChord(chord, root, mode)) {
          hasTonicChord = true;
          break;
        }
      }

      candidates.push({ root, mode, fitScore, hasTonicChord, modeIndex: mi });
    }
  }

  if (candidates.length === 0) return null;

  // Sort: hasTonicChord DESC, modeIndex ASC, fitScore DESC
  candidates.sort((a, b) => {
    if (a.hasTonicChord !== b.hasTonicChord) return a.hasTonicChord ? -1 : 1;
    if (a.modeIndex !== b.modeIndex) return a.modeIndex - b.modeIndex;
    return b.fitScore - a.fitScore;
  });

  return { root: candidates[0].root, mode: candidates[0].mode };
}
