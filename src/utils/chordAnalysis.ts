/**
 * Chord detection utilities.
 *
 * Kept from the original auto-analysis system:
 * - detectWithFallback: detect chord from pitch classes with progressive fallback
 * - pickBestChord: pick most intuitive chord from tonal.js candidates
 * - chordComplexityScore: scoring for disambiguation
 */

import { Chord, Note as TonalNote } from 'tonal';

export const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Score a chord name by complexity — lower = simpler = preferred.
 */
export function chordComplexityScore(chordName: string): number {
  const parsed = Chord.get(chordName);
  const type = (parsed.type ?? '').toLowerCase();

  const hasSlash = chordName.includes('/');
  const slashPenalty = hasSlash ? 50 : 0;

  let typeScore: number;
  if (type === 'major' || type === '' || type === 'minor') {
    typeScore = 0;
  } else if (type === '7' || type === 'maj7' || type === 'm7' || type === 'dominant seventh') {
    typeScore = 10;
  } else if (type === 'sus4' || type === 'sus2') {
    typeScore = 15;
  } else if (type === 'dim' || type === 'diminished' || type === 'dim7' || type === 'diminished seventh') {
    typeScore = 20;
  } else if (type === 'aug' || type === 'augmented') {
    typeScore = 25;
  } else if (type === 'm7b5' || type === 'half-diminished') {
    typeScore = 22;
  } else if (type.includes('#5') || type.includes('b5')) {
    typeScore = 30;
  } else if (type.includes('add') || type.includes('9') || type.includes('11') || type.includes('13')) {
    typeScore = 18;
  } else {
    typeScore = 35;
  }

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

  let filtered = detected;
  if (pitchClasses && pitchClasses.length > 0) {
    filtered = detected.filter((name) => {
      const parsed = Chord.get(name);
      const type = (parsed.type ?? '').toLowerCase();
      const tonic = parsed.tonic;

      if (tonic && (type.includes('sus4') || type.includes('sus2'))) {
        const rootMidi = TonalNote.midi(tonic + '4');
        if (rootMidi != null) {
          const intervals = new Set(
            pitchClasses.map((pc) => {
              const midi = TonalNote.midi(pc + '4');
              return midi != null ? ((midi - rootMidi) % 12 + 12) % 12 : -1;
            }),
          );
          const has3rd = intervals.has(4);
          const hasMinor3rd = intervals.has(3);
          const has4th = intervals.has(5);
          if ((has3rd || hasMinor3rd) && has4th) return false;
        }
      }
      return true;
    });
  }

  if (filtered.length === 0) filtered = detected;
  if (filtered.length === 1) return filtered[0];

  const bassRootChords: string[] = [];
  const otherChords: string[] = [];

  for (const name of filtered) {
    const parsed = Chord.get(name);
    if (parsed.tonic === bassName) {
      bassRootChords.push(name);
    } else {
      otherChords.push(name);
    }
  }

  const candidates = bassRootChords.length > 0 ? bassRootChords : otherChords;
  candidates.sort((a, b) => chordComplexityScore(a) - chordComplexityScore(b));
  return candidates[0];
}

/**
 * Detect a chord from pitch classes with progressive fallback.
 * If the full set doesn't match, drops one pitch class at a time and retries.
 */
export function detectWithFallback(
  pitchClasses: string[],
  bassName: string,
): { chordName: string | null; usedPitchClasses: string[] } {
  const fullDetected = Chord.detect(pitchClasses);
  const fullBest = pickBestChord(fullDetected, bassName, pitchClasses);
  if (fullBest) {
    return { chordName: fullBest, usedPitchClasses: pitchClasses };
  }

  if (pitchClasses.length <= 1) {
    return { chordName: null, usedPitchClasses: pitchClasses };
  }

  let bestResult: { chordName: string; usedPitchClasses: string[]; score: number } | null = null;

  for (let i = 0; i < pitchClasses.length; i++) {
    const subset = pitchClasses.filter((_, idx) => idx !== i);
    const detected = Chord.detect(subset);
    const best = pickBestChord(detected, bassName, pitchClasses);
    if (best) {
      const score = chordComplexityScore(best);
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
