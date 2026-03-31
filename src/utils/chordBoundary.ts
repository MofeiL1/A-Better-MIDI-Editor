/**
 * Chord boundary detection algorithm.
 *
 * Detects where chords change in a sequence of notes, regardless of texture
 * (block chords, arpeggios, walking bass, anticipation, etc.).
 *
 * Perceptual principles:
 * 1. The human ear tracks "harmonic bass" as a separate auditory stream in
 *    the low register. The bass is not simply "the lowest note sounding now"
 *    — it's the lowest note recently attacked in the bass register. In an
 *    ascending arpeggio C-E-G, the harmonic bass stays C.
 * 2. Register separation: the ear distinguishes bass register from melody.
 *    A melody note that briefly dips low doesn't override the established bass.
 * 3. Bass notes on strong beats carry more perceptual weight.
 * 4. Bass PC change is the primary chord-change signal; significant upper-voice
 *    PC change is secondary (handles pedal points).
 */

type SimpleNote = { pitch: number; startTick: number; duration: number };

export type ChordSegment = {
  startTick: number;
  endTick: number;
  /** Pitch class of the structural bass in this segment */
  bassPc: number;
  /** All pitch classes present, duration-weighted */
  pcWeights: Float64Array;
  /** Set of pitch classes with significant presence */
  pcs: Set<number>;
};

/**
 * Detect chord boundaries from a note sequence.
 */
export function detectChordBoundaries(
  notes: SimpleNote[],
  ticksPerBeat: number,
  options: {
    /** Minimum segment duration in beats (default: 1) */
    minSegmentBeats?: number;
    /** PC weight threshold as fraction of max weight to be in pcs set (default: 0.1) */
    pcThreshold?: number;
    /** Jaccard distance threshold for PC set change without bass change (default: 0.6) */
    pcChangeThreshold?: number;
  } = {},
): ChordSegment[] {
  if (notes.length === 0) return [];

  const minSegmentBeats = options.minSegmentBeats ?? 1;
  const pcThreshold = options.pcThreshold ?? 0.1;
  const pcChangeThreshold = options.pcChangeThreshold ?? 0.6;
  const minSegmentTicks = minSegmentBeats * ticksPerBeat;

  // Find time extent
  const maxTick = Math.max(...notes.map(n => n.startTick + n.duration));
  const totalBeats = Math.ceil(maxTick / ticksPerBeat);
  if (totalBeats === 0) return [];

  // --- Phase 1: Beat-level analysis with structural bass tracking ---

  type BeatInfo = {
    tick: number;
    /** All notes active (sounding or starting) during this beat */
    activeNotes: SimpleNote[];
    /** Notes with onset during this beat */
    onsetNotes: SimpleNote[];
    /** All active PCs */
    activePcs: Set<number>;
    /** PCs from onset notes only */
    onsetPcs: Set<number>;
    /** Structural bass PC (lowest onset, sticky) */
    structuralBassPc: number;
    hasNotes: boolean;
  };

  const beats: BeatInfo[] = [];

  // Structural bass tracking state
  // minBassLifetime: bass stays "alive" for at least this many ticks even after
  // the physical note ends. This prevents arpeggio fragments from resetting
  // the bass. E.g., in C-E-G arpeggio, C remains the bass even after C decays.
  const minBassLifetime = ticksPerBeat * 4; // 1 bar
  let structBass: { pitch: number; pc: number; noteEnd: number; setAt: number } | null = null;

  for (let b = 0; b < totalBeats; b++) {
    const beatStart = b * ticksPerBeat;
    const beatEnd = beatStart + ticksPerBeat;

    // Active notes: overlap [beatStart, beatEnd)
    const activeNotes: SimpleNote[] = [];
    const onsetNotes: SimpleNote[] = [];
    for (const n of notes) {
      const noteEnd = n.startTick + n.duration;
      if (n.startTick < beatEnd && noteEnd > beatStart) {
        activeNotes.push(n);
        if (n.startTick >= beatStart && n.startTick < beatEnd) {
          onsetNotes.push(n);
        }
      }
    }

    if (activeNotes.length === 0) {
      structBass = null; // bass decayed
      beats.push({
        tick: beatStart, activeNotes: [], onsetNotes: [],
        activePcs: new Set(), onsetPcs: new Set(),
        structuralBassPc: -1, hasNotes: false,
      });
      continue;
    }

    const activePcs = new Set<number>();
    for (const n of activeNotes) activePcs.add(((n.pitch % 12) + 12) % 12);

    const onsetPcs = new Set<number>();
    for (const n of onsetNotes) onsetPcs.add(((n.pitch % 12) + 12) % 12);

    // Update structural bass
    // 1. Check if structural bass has fully decayed (note ended AND grace period expired)
    if (structBass) {
      const noteDecayed = structBass.noteEnd <= beatStart;
      const graceExpired = (beatStart - structBass.setAt) >= minBassLifetime;
      if (noteDecayed && graceExpired) {
        structBass = null;
      }
    }

    // 2. Check onsets: if any onset is lower than current structural bass → update
    if (onsetNotes.length > 0) {
      const lowestOnset = onsetNotes.reduce((a, c) => a.pitch < c.pitch ? a : c);
      if (!structBass || lowestOnset.pitch < structBass.pitch) {
        structBass = {
          pitch: lowestOnset.pitch,
          pc: ((lowestOnset.pitch % 12) + 12) % 12,
          noteEnd: lowestOnset.startTick + lowestOnset.duration,
          setAt: beatStart,
        };
      } else if (lowestOnset.pitch === structBass.pitch) {
        // Same bass pitch re-attacked → extend its lifetime
        const newEnd = lowestOnset.startTick + lowestOnset.duration;
        if (newEnd > structBass.noteEnd) {
          structBass.noteEnd = newEnd;
          structBass.setAt = beatStart;
        }
      }
    }

    // 3. If still no bass (fully decayed, no new onsets lower), use lowest active
    if (!structBass) {
      const lowestActive = activeNotes.reduce((a, c) => a.pitch < c.pitch ? a : c);
      structBass = {
        pitch: lowestActive.pitch,
        pc: ((lowestActive.pitch % 12) + 12) % 12,
        noteEnd: lowestActive.startTick + lowestActive.duration,
        setAt: beatStart,
      };
    }

    beats.push({
      tick: beatStart,
      activeNotes, onsetNotes,
      activePcs, onsetPcs,
      structuralBassPc: structBass.pc,
      hasNotes: true,
    });
  }

  // --- Phase 2: Detect boundaries ---

  let firstActive = 0;
  while (firstActive < beats.length && !beats[firstActive].hasNotes) firstActive++;
  if (firstActive >= beats.length) return [];

  type RawBoundary = { beatIndex: number; tick: number };
  const boundaries: RawBoundary[] = [{ beatIndex: firstActive, tick: beats[firstActive].tick }];

  // Track accumulated PCs for the current segment (for change detection)
  let accumPcs = new Set(beats[firstActive].activePcs);

  let prevActive = firstActive;
  for (let b = firstActive + 1; b < beats.length; b++) {
    if (!beats[b].hasNotes) continue;

    const prev = beats[prevActive];
    const curr = beats[b];

    let isBoundary = false;

    // Primary signal: structural bass PC changed
    if (curr.structuralBassPc !== prev.structuralBassPc) {
      isBoundary = true;
    }

    // Secondary signal: new onsets introduce PCs not in accumulated set
    // (detects pedal point / sustained bass situations where bass stays but harmony changes)
    if (!isBoundary && curr.onsetNotes.length >= 2 && accumPcs.size > 0) {
      const newPcs = [...curr.onsetPcs].filter(pc => !accumPcs.has(pc));
      if (newPcs.length >= 2) {
        isBoundary = true;
      }
    }

    if (isBoundary) {
      boundaries.push({ beatIndex: b, tick: curr.tick });
      accumPcs = new Set(curr.activePcs);
    } else {
      // Accumulate PCs
      for (const pc of curr.activePcs) accumPcs.add(pc);
    }

    prevActive = b;
  }

  // --- Phase 3: Enforce minimum segment length ---
  const mergedBoundaries: RawBoundary[] = [boundaries[0]];
  for (let i = 1; i < boundaries.length; i++) {
    const prevBoundary = mergedBoundaries[mergedBoundaries.length - 1];
    const gap = boundaries[i].tick - prevBoundary.tick;
    if (gap >= minSegmentTicks) {
      mergedBoundaries.push(boundaries[i]);
    }
  }

  // --- Phase 4: Build segments with duration-weighted PC distributions ---
  // Use the structural bass from Phase 1 (not absolute lowest pitch).
  // The structural bass represents what the ear perceives as the harmonic bass.
  const segments: ChordSegment[] = [];

  for (let i = 0; i < mergedBoundaries.length; i++) {
    const startTick = mergedBoundaries[i].tick;
    const endTick = i + 1 < mergedBoundaries.length
      ? mergedBoundaries[i + 1].tick
      : maxTick;

    const segNotes: SimpleNote[] = [];
    for (const n of notes) {
      const noteEnd = n.startTick + n.duration;
      if (n.startTick < endTick && noteEnd > startTick) {
        segNotes.push(n);
      }
    }

    if (segNotes.length === 0) continue;

    // Duration-weighted PC distribution
    const pcWeights = new Float64Array(12);
    for (const n of segNotes) {
      const pc = ((n.pitch % 12) + 12) % 12;
      const effectiveStart = Math.max(n.startTick, startTick);
      const effectiveEnd = Math.min(n.startTick + n.duration, endTick);
      const w = Math.max(0, effectiveEnd - effectiveStart);
      pcWeights[pc] += w;
    }

    // Determine bass PC: use the lowest note with onset in this segment.
    // Onset notes (attacked within the segment) are more relevant than sustained
    // notes bleeding over from a previous segment.
    let lowestOnsetPitch = Infinity;
    let lowestAnyPitch = Infinity;
    for (const n of segNotes) {
      if (n.pitch < lowestAnyPitch) lowestAnyPitch = n.pitch;
      if (n.startTick >= startTick && n.startTick < endTick && n.pitch < lowestOnsetPitch) {
        lowestOnsetPitch = n.pitch;
      }
    }
    const bassRefPitch = lowestOnsetPitch < Infinity ? lowestOnsetPitch : lowestAnyPitch;
    const bassPc = ((bassRefPitch % 12) + 12) % 12;

    // Build PC set
    const maxW = Math.max(...pcWeights);
    const pcs = new Set<number>();
    if (maxW > 0) {
      for (let pc = 0; pc < 12; pc++) {
        if (pcWeights[pc] / maxW >= pcThreshold) pcs.add(pc);
      }
    }

    segments.push({ startTick, endTick, bassPc, pcWeights, pcs });
  }

  return segments;
}
