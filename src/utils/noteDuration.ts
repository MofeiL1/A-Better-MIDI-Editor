import type { Note } from '../types/model';
import { computeRoleMap } from './noteRole';

/**
 * Compute auto-legato duration for a note with `duration === null`.
 * Role-aware: only looks at notes with the same effective role
 * (melody→melody, chord→chord) to find the next startTick.
 */
export function computeAutoLegato(
  note: Note,
  allNotes: Note[],
  ticksPerMeasure: number,
): number {
  const roleMap = computeRoleMap(allNotes);
  const noteRole = roleMap.get(note.id) ?? 'melody';

  // Find the smallest startTick strictly greater, among same-role notes
  let nextTick = Infinity;
  for (const n of allNotes) {
    if ((roleMap.get(n.id) ?? 'melody') !== noteRole) continue;
    if (n.startTick > note.startTick && n.startTick < nextTick) {
      nextTick = n.startTick;
    }
  }

  if (nextTick < Infinity) {
    return nextTick - note.startTick;
  }

  // Last group: extend to end of current measure
  const measureStart = Math.floor(note.startTick / ticksPerMeasure) * ticksPerMeasure;
  const measureEnd = measureStart + ticksPerMeasure;
  const dur = measureEnd - note.startTick;
  return dur > 0 ? dur : ticksPerMeasure;
}

/**
 * Get the effective duration of a note.
 * If `duration` is set, return it directly.
 * If `duration` is null, compute auto-legato from surrounding notes.
 */
export function getEffectiveDuration(
  note: Note,
  allNotes: Note[],
  ticksPerMeasure: number,
): number {
  if (note.duration !== null) {
    return note.duration;
  }
  return computeAutoLegato(note, allNotes, ticksPerMeasure);
}

/**
 * Compute effective durations for all notes with `duration === null`.
 * Role-aware: melody notes only look at melody ticks, chord notes only at chord ticks.
 * Returns a Map from note ID to effective duration (only for null-duration notes).
 */
export function computeNullDurations(
  allNotes: Note[],
  ticksPerMeasure: number,
): Map<string, number> {
  const result = new Map<string, number>();
  const nullNotes = allNotes.filter((n) => n.duration === null);
  if (nullNotes.length === 0) return result;

  const roleMap = computeRoleMap(allNotes);

  // Collect sorted unique startTicks per role
  const melodyTickSet = new Set<number>();
  const chordTickSet = new Set<number>();
  for (const n of allNotes) {
    if ((roleMap.get(n.id) ?? 'melody') === 'melody') {
      melodyTickSet.add(n.startTick);
    } else {
      chordTickSet.add(n.startTick);
    }
  }
  const melodyTicks = Array.from(melodyTickSet).sort((a, b) => a - b);
  const chordTicks = Array.from(chordTickSet).sort((a, b) => a - b);

  for (const note of nullNotes) {
    const role = roleMap.get(note.id) ?? 'melody';
    const sortedTicks = role === 'melody' ? melodyTicks : chordTicks;
    const idx = sortedTicks.indexOf(note.startTick);

    if (idx >= 0 && idx < sortedTicks.length - 1) {
      result.set(note.id, sortedTicks[idx + 1] - note.startTick);
    } else {
      const measureStart = Math.floor(note.startTick / ticksPerMeasure) * ticksPerMeasure;
      const measureEnd = measureStart + ticksPerMeasure;
      const dur = measureEnd - note.startTick;
      result.set(note.id, dur > 0 ? dur : ticksPerMeasure);
    }
  }

  return result;
}
