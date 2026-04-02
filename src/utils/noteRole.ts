import type { Note } from '../types/model';

const TICKS_PER_BEAT = 480;
/** Each beat of time distance adds this many semitones of penalty to the score. */
const TIME_WEIGHT = 1;

export type Anchor = { tick: number; pitch: number };

/**
 * Batch-compute effective roles for all notes.
 *
 * Two-pass algorithm:
 * 1. "Anchor" pass — multi-note ticks use top-note heuristic; explicit roles are anchors too.
 * 2. "Proximity" pass — single-note ticks (with no explicit role) use weighted score:
 *    score = pitchDistance + (tickGap / TICKS_PER_BEAT) * TIME_WEIGHT
 *    where tickGap is the distance from the new note to the anchor's time span [start, end].
 *    If the note falls within the span, tickGap = 0.
 */
export function computeRoleMap(allNotes: Note[]): Map<string, 'melody' | 'chord'> {
  const result = new Map<string, 'melody' | 'chord'>();

  // Group by startTick
  const groups = new Map<number, Note[]>();
  for (const n of allNotes) {
    let g = groups.get(n.startTick);
    if (!g) { g = []; groups.set(n.startTick, g); }
    g.push(n);
  }

  // Anchors: notes with high-confidence roles (multi-note ticks + explicit roles)
  const melodyAnchors: Anchor[] = [];
  const chordAnchors: Anchor[] = [];

  // Pending: single-note ticks with no explicit role, need proximity pass
  const pending: Note[] = [];

  for (const [, group] of groups) {
    if (group.length === 1) {
      const n = group[0];
      if (n.role) {
        // Explicit role → anchor
        result.set(n.id, n.role);
        const anchor = { tick: n.startTick, pitch: n.pitch };
        (n.role === 'melody' ? melodyAnchors : chordAnchors).push(anchor);
      } else {
        // Defer to proximity pass
        pending.push(n);
      }
      continue;
    }

    // Multi-note group: top-note heuristic
    let topId = '';
    let topPitch = -1;
    let hasExplicitMelody = false;

    for (const n of group) {
      if (n.role === 'melody') {
        if (!hasExplicitMelody || n.pitch > topPitch) {
          topId = n.id;
          topPitch = n.pitch;
        }
        hasExplicitMelody = true;
      } else if (!hasExplicitMelody && n.role !== 'chord') {
        if (n.pitch > topPitch) {
          topPitch = n.pitch;
          topId = n.id;
        }
      }
    }

    for (const n of group) {
      let role: 'melody' | 'chord';
      if (n.role) {
        role = n.role;
      } else {
        role = n.id === topId ? 'melody' : 'chord';
      }
      result.set(n.id, role);
      const anchor = { tick: n.startTick, pitch: n.pitch };
      (role === 'melody' ? melodyAnchors : chordAnchors).push(anchor);
    }
  }

  // Proximity pass for single-note ticks without explicit role
  for (const n of pending) {
    if (chordAnchors.length === 0) {
      result.set(n.id, 'melody');
      continue;
    }
    if (melodyAnchors.length === 0) {
      result.set(n.id, 'chord');
      continue;
    }

    const scoreMelody = anchorScore(n.startTick, n.pitch, melodyAnchors);
    const scoreChord = anchorScore(n.startTick, n.pitch, chordAnchors);

    result.set(n.id, scoreChord < scoreMelody ? 'chord' : 'melody');
  }

  return result;
}

/**
 * Compute weighted score for a note against a set of anchors.
 * Score = pitchDistance + (tickDistance / TICKS_PER_BEAT) * TIME_WEIGHT
 * Returns the minimum score across all anchors (best match wins).
 */
export function anchorScore(tick: number, pitch: number, anchors: Anchor[]): number {
  let best = Infinity;
  for (const a of anchors) {
    const pitchDist = Math.abs(pitch - a.pitch);
    const tickDist = Math.abs(tick - a.tick) / TICKS_PER_BEAT * TIME_WEIGHT;
    const score = pitchDist + tickDist;
    if (score < best) best = score;
  }
  return best;
}

/**
 * Predict what role a hypothetical note at (tick, pitch) would get
 * if placed into the current note set. Used for ghost preview coloring.
 */
export function predictRole(
  tick: number,
  pitch: number,
  allNotes: Note[],
  roleMap: Map<string, 'melody' | 'chord'>,
): 'melody' | 'chord' {
  // Check if there are other notes at this tick
  const sameTickNotes = allNotes.filter(n => n.startTick === tick);

  if (sameTickNotes.length > 0) {
    const maxExistingPitch = Math.max(...sameTickNotes.map(n => n.pitch));
    if (pitch >= maxExistingPitch) return 'melody';
    const hasExplicitMelody = sameTickNotes.some(n => n.role === 'melody');
    if (hasExplicitMelody) return 'chord';
    return 'chord';
  }

  // No notes at this tick — use anchor proximity
  const melodyAnchors: Anchor[] = [];
  const chordAnchors: Anchor[] = [];

  for (const n of allNotes) {
    const role = roleMap.get(n.id) ?? 'melody';
    const anchor = { tick: n.startTick, pitch: n.pitch };
    (role === 'melody' ? melodyAnchors : chordAnchors).push(anchor);
  }

  if (chordAnchors.length === 0) return 'melody';
  if (melodyAnchors.length === 0) return 'chord';

  const scoreMelody = anchorScore(tick, pitch, melodyAnchors);
  const scoreChord = anchorScore(tick, pitch, chordAnchors);

  return scoreChord < scoreMelody ? 'chord' : 'melody';
}

/**
 * Infer a note's effective role (convenience wrapper around computeRoleMap for single note).
 */
export function getEffectiveRole(note: Note, allNotes: Note[]): 'melody' | 'chord' {
  const roleMap = computeRoleMap(allNotes);
  return roleMap.get(note.id) ?? 'melody';
}

/**
 * Get all notes with the same effective role as the given note.
 */
export function getSameRoleNotes(
  note: Note,
  allNotes: Note[],
  roleMap: Map<string, 'melody' | 'chord'>,
): Note[] {
  const role = roleMap.get(note.id) ?? 'melody';
  return allNotes.filter(n => (roleMap.get(n.id) ?? 'melody') === role);
}
