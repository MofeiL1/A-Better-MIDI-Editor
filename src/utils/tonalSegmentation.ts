/**
 * Tonal Segmentation: detect local key regions with confidence scores.
 *
 * Algorithm:
 *   1. Slice notes into chord-sized time segments
 *   2. Score each segment against 72 candidate keys (12 roots × 6 modes)
 *   3. Build a key-distance matrix (shared-note similarity)
 *   4. Forward-backward propagation (HMM-style) to smooth local scores
 *   5. Output per-segment probability distribution over keys
 */

import { SCALE_PATTERNS } from './music';

// ─── Types ───────────────────────────────────────────────

export type KeyCandidate = { root: number; mode: string };

export type SegmentResult = {
  startTick: number;
  endTick: number;
  /** Probability for each of the 72 candidates (same order as CANDIDATES) */
  probs: number[];
  /** Index of highest-probability candidate */
  bestIdx: number;
};

export type TonalSegmentationResult = {
  candidates: KeyCandidate[];
  segments: SegmentResult[];
  /** 72×72 distance matrix (0 = identical, 1 = maximally different) */
  distanceMatrix: number[][];
};

// ─── Constants ───────────────────────────────────────────

const DETECT_MODES = [
  'major',
  'natural minor',
  'dorian',
  'mixolydian',
  'harmonic minor',
  'melodic minor',
] as const;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** All 72 candidates in fixed order. */
export const CANDIDATES: KeyCandidate[] = [];
for (let root = 0; root < 12; root++) {
  for (const mode of DETECT_MODES) {
    CANDIDATES.push({ root, mode });
  }
}

// ─── Pre-computed scale note sets ────────────────────────

/** For each candidate index, the Set of pitch classes (0-11) in that scale. */
const CANDIDATE_PC_SETS: Set<number>[] = CANDIDATES.map(({ root, mode }) => {
  const pattern = SCALE_PATTERNS[mode]!;
  return new Set(pattern.map((i) => (root + i) % 12));
});

// ─── Key distance matrix ─────────────────────────────────

/**
 * Distance between two keys = 1 - (shared pitch classes / 7).
 * Same key = 0, maximally different ≈ 0.57 (4/7 shared at worst for 7-note scales).
 * Relative major/minor share 6-7 notes → very close.
 */
function buildDistanceMatrix(): number[][] {
  const n = CANDIDATES.length;
  const mat: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    const a = CANDIDATE_PC_SETS[i];
    for (let j = i + 1; j < n; j++) {
      const b = CANDIDATE_PC_SETS[j];
      let shared = 0;
      for (const pc of a) {
        if (b.has(pc)) shared++;
      }
      const maxSize = Math.max(a.size, b.size);
      const dist = 1 - shared / maxSize;
      mat[i][j] = dist;
      mat[j][i] = dist;
    }
  }
  return mat;
}

export const DISTANCE_MATRIX = buildDistanceMatrix();

// ─── Step 1: Segment notes by time slices ────────────────

type SimpleNote = { pitch: number; startTick: number; duration: number };

type TimeSlice = {
  startTick: number;
  endTick: number;
  notes: SimpleNote[];
};

/**
 * Slice notes into fixed-width time segments (default = 1 bar).
 * Notes that span multiple segments contribute to each proportionally.
 */
function sliceByTime(notes: SimpleNote[], sliceWidth: number): TimeSlice[] {
  if (notes.length === 0) return [];
  const maxTick = Math.max(...notes.map((n) => n.startTick + n.duration));
  const numSlices = Math.ceil(maxTick / sliceWidth);
  const slices: TimeSlice[] = [];

  for (let i = 0; i < numSlices; i++) {
    const start = i * sliceWidth;
    const end = start + sliceWidth;
    // Collect notes that overlap this slice
    const overlapping = notes.filter(
      (n) => n.startTick < end && n.startTick + n.duration > start,
    );
    if (overlapping.length > 0) {
      slices.push({ startTick: start, endTick: end, notes: overlapping });
    }
  }
  return slices;
}

// ─── Step 2: Local scoring ───────────────────────────────

/**
 * For one time slice, compute raw fitScore for each of the 72 candidates.
 * Uses count × duration weighting (clipped to the slice boundaries).
 */
function scoreSlice(slice: TimeSlice): number[] {
  // Accumulate weight per pitch class
  const pcWeight = new Float64Array(12);
  let totalWeight = 0;

  for (const n of slice.notes) {
    const pc = ((n.pitch % 12) + 12) % 12;
    // Clip duration to slice boundaries
    const effectiveStart = Math.max(n.startTick, slice.startTick);
    const effectiveEnd = Math.min(n.startTick + n.duration, slice.endTick);
    const w = effectiveEnd - effectiveStart;
    if (w <= 0) continue;
    pcWeight[pc] += w;
    totalWeight += w;
  }

  if (totalWeight === 0) return new Array(CANDIDATES.length).fill(0);

  const scores = new Array(CANDIDATES.length);
  for (let i = 0; i < CANDIDATES.length; i++) {
    const scaleSet = CANDIDATE_PC_SETS[i];
    let inScaleW = 0;
    for (let pc = 0; pc < 12; pc++) {
      if (pcWeight[pc] > 0 && scaleSet.has(pc)) {
        inScaleW += pcWeight[pc];
      }
    }
    scores[i] = inScaleW / totalWeight;
  }
  return scores;
}

// ─── Step 3: Forward-backward smoothing ──────────────────

/**
 * Smooth local scores using forward-backward propagation.
 *
 * transitionSharpness controls how much we penalize key changes:
 *   higher = stronger preference for staying in the same key.
 */
function smooth(
  localScores: number[][],
  distMatrix: number[][],
  transitionSharpness: number = 8,
): number[][] {
  const T = localScores.length;
  const K = CANDIDATES.length;
  if (T === 0) return [];

  // Precompute transition matrix: trans[i][j] = exp(-sharpness * dist(i,j))
  const trans: number[][] = Array.from({ length: K }, (_, i) =>
    Array.from({ length: K }, (_, j) =>
      Math.exp(-transitionSharpness * distMatrix[i][j]),
    ),
  );

  // Forward pass
  const fwd: number[][] = Array.from({ length: T }, () => new Array(K).fill(0));
  // Initialize
  for (let k = 0; k < K; k++) fwd[0][k] = localScores[0][k];
  normalize(fwd[0]);

  for (let t = 1; t < T; t++) {
    for (let k = 0; k < K; k++) {
      let sum = 0;
      for (let prev = 0; prev < K; prev++) {
        sum += fwd[t - 1][prev] * trans[prev][k];
      }
      fwd[t][k] = sum * localScores[t][k];
    }
    normalize(fwd[t]);
  }

  // Backward pass
  const bwd: number[][] = Array.from({ length: T }, () => new Array(K).fill(0));
  for (let k = 0; k < K; k++) bwd[T - 1][k] = 1;
  normalize(bwd[T - 1]);

  for (let t = T - 2; t >= 0; t--) {
    for (let k = 0; k < K; k++) {
      let sum = 0;
      for (let next = 0; next < K; next++) {
        sum += bwd[t + 1][next] * trans[k][next] * localScores[t + 1][next];
      }
      bwd[t][k] = sum;
    }
    normalize(bwd[t]);
  }

  // Combine: posterior ∝ forward × backward
  const posterior: number[][] = Array.from({ length: T }, () => new Array(K).fill(0));
  for (let t = 0; t < T; t++) {
    for (let k = 0; k < K; k++) {
      posterior[t][k] = fwd[t][k] * bwd[t][k];
    }
    normalize(posterior[t]);
  }

  return posterior;
}

function normalize(arr: number[]): void {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  if (sum > 0) {
    for (let i = 0; i < arr.length; i++) arr[i] /= sum;
  }
}

// ─── Public API ──────────────────────────────────────────

export interface TonalSegmentationOptions {
  /** Width of each time slice in ticks (default: 1 bar = ticksPerBeat × 4) */
  sliceWidth?: number;
  /** How strongly to penalize key changes (default: 8) */
  transitionSharpness?: number;
}

export function analyzeTonalSegments(
  notes: SimpleNote[],
  ticksPerBeat: number,
  options: TonalSegmentationOptions = {},
): TonalSegmentationResult {
  const sliceWidth = options.sliceWidth ?? ticksPerBeat * 4;
  const transitionSharpness = options.transitionSharpness ?? 8;

  // Step 1: Slice
  const slices = sliceByTime(notes, sliceWidth);

  // Step 2: Local scoring
  const localScores = slices.map((s) => scoreSlice(s));

  // Step 3: Smooth
  const posteriors = smooth(localScores, DISTANCE_MATRIX, transitionSharpness);

  // Step 4: Build results
  const segments: SegmentResult[] = slices.map((slice, t) => {
    const probs = posteriors[t] ?? new Array(CANDIDATES.length).fill(0);
    let bestIdx = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > probs[bestIdx]) bestIdx = i;
    }
    return {
      startTick: slice.startTick,
      endTick: slice.endTick,
      probs,
      bestIdx,
    };
  });

  return {
    candidates: CANDIDATES,
    segments,
    distanceMatrix: DISTANCE_MATRIX,
  };
}

// ─── Utilities for display ───────────────────────────────

export function candidateName(idx: number): string {
  const c = CANDIDATES[idx];
  return `${NOTE_NAMES[c.root]} ${c.mode}`;
}

/**
 * Merge 72 candidates into 12 roots by taking max probability across modes.
 * Returns [segments.length][12] array + the winning mode for each.
 */
export function collapseToRoots(
  segments: SegmentResult[],
): { rootProbs: number[][]; rootModes: string[][] } {
  const rootProbs: number[][] = [];
  const rootModes: string[][] = [];

  for (const seg of segments) {
    const rp = new Array(12).fill(0);
    const rm = new Array(12).fill('');
    for (let i = 0; i < CANDIDATES.length; i++) {
      const root = CANDIDATES[i].root;
      if (seg.probs[i] > rp[root]) {
        rp[root] = seg.probs[i];
        rm[root] = CANDIDATES[i].mode;
      }
    }
    rootProbs.push(rp);
    rootModes.push(rm);
  }
  return { rootProbs, rootModes };
}
