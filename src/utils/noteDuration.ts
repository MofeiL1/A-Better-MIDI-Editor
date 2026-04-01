import type { Note } from '../types/model';

/**
 * Compute auto-legato duration for a note with `duration === null`.
 * Duration extends to the next event (any note with a different startTick),
 * or to the end of the current measure if it's the last event.
 */
export function computeAutoLegato(
  note: Note,
  allNotes: Note[],
  ticksPerMeasure: number,
): number {
  // Find the smallest startTick that is strictly greater than this note's startTick
  let nextTick = Infinity;
  for (const n of allNotes) {
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
 * Returns a Map from note ID to effective duration (only for null-duration notes).
 */
export function computeNullDurations(
  allNotes: Note[],
  ticksPerMeasure: number,
): Map<string, number> {
  const result = new Map<string, number>();
  const nullNotes = allNotes.filter((n) => n.duration === null);
  if (nullNotes.length === 0) return result;

  // Collect all unique startTicks, sorted
  const tickSet = new Set<number>();
  for (const n of allNotes) tickSet.add(n.startTick);
  const sortedTicks = Array.from(tickSet).sort((a, b) => a - b);

  for (const note of nullNotes) {
    const idx = sortedTicks.indexOf(note.startTick);
    if (idx < sortedTicks.length - 1) {
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
