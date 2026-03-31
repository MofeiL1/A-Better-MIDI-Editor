/**
 * Tonal Segmentation: detect local key regions with confidence scores.
 *
 * Algorithm:
 *   1. Slice notes into time segments (1 bar each)
 *   2. Score each segment against 72 candidate keys — pitch class fit only
 *   3. Forward-backward propagation (HMM-style) to smooth local scores
 *   4. Global tonic disambiguation: use bass frequency, V→I resolutions,
 *      and start/end position to pick the actual tonic among modes sharing
 *      the same pitch class set
 *   5. Output per-segment probabilities + global ranking + atonal/ambiguity flags
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

export type RankedKey = {
  root: number;
  mode: string;
  confidence: number;
  candidateIdx: number;
};

export type TonalSegmentationResult = {
  candidates: KeyCandidate[];
  segments: SegmentResult[];
  distanceMatrix: number[][];
  /** Top keys ranked by global confidence, best first */
  globalRanking: RankedKey[];
  /** True if no key has sufficient confidence → suggest atonal */
  isLikelyAtonal: boolean;
  /** Confidence of the #1 key (0-1) */
  topConfidence: number;
  /** True if #1 and #2 are close → ambiguous, user should confirm */
  isAmbiguous: boolean;
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

export const CANDIDATES: KeyCandidate[] = [];
for (let root = 0; root < 12; root++) {
  for (const mode of DETECT_MODES) {
    CANDIDATES.push({ root, mode });
  }
}

const NUM_CANDIDATES = CANDIDATES.length; // 72

const ATONAL_THRESHOLD = 0.04;
const AMBIGUITY_GAP = 0.015;

// ─── Pre-computed data ───────────────────────────────────

const CANDIDATE_PC_SETS: Set<number>[] = CANDIDATES.map(({ root, mode }) => {
  const pattern = SCALE_PATTERNS[mode]!;
  return new Set(pattern.map((i) => (root + i) % 12));
});

const CANDIDATE_ROOTS: number[] = CANDIDATES.map((c) => c.root);

/** Dominant (5th degree) pitch class for each candidate. */
const CANDIDATE_DOMINANTS: number[] = CANDIDATES.map(({ root, mode }) => {
  const pattern = SCALE_PATTERNS[mode]!;
  return (root + pattern[4]) % 12;
});

/**
 * Group indices: candidates sharing the same pitch class set.
 * Key = sorted comma-joined PCs. Value = array of candidate indices.
 */
const PC_SET_GROUPS: Map<string, number[]> = new Map();
for (let i = 0; i < NUM_CANDIDATES; i++) {
  const key = [...CANDIDATE_PC_SETS[i]].sort((a, b) => a - b).join(',');
  const group = PC_SET_GROUPS.get(key);
  if (group) group.push(i);
  else PC_SET_GROUPS.set(key, [i]);
}

// ─── Key distance matrix ─────────────────────────────────

function buildDistanceMatrix(): number[][] {
  const n = NUM_CANDIDATES;
  const mat: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    const a = CANDIDATE_PC_SETS[i];
    for (let j = i + 1; j < n; j++) {
      const b = CANDIDATE_PC_SETS[j];
      let shared = 0;
      for (const pc of a) if (b.has(pc)) shared++;
      const maxSize = Math.max(a.size, b.size);
      const dist = 1 - shared / maxSize;
      mat[i][j] = dist;
      mat[j][i] = dist;
    }
  }
  return mat;
}

export const DISTANCE_MATRIX = buildDistanceMatrix();

// ─── Step 1: Slice ───────────────────────────────────────

type SimpleNote = { pitch: number; startTick: number; duration: number };

type TimeSlice = {
  startTick: number;
  endTick: number;
  notes: SimpleNote[];
  bassPc: number; // pitch class of lowest note
};

function sliceByTime(notes: SimpleNote[], sliceWidth: number): TimeSlice[] {
  if (notes.length === 0) return [];
  const maxTick = Math.max(...notes.map((n) => n.startTick + n.duration));
  const numSlices = Math.ceil(maxTick / sliceWidth);
  const slices: TimeSlice[] = [];

  for (let i = 0; i < numSlices; i++) {
    const start = i * sliceWidth;
    const end = start + sliceWidth;
    const overlapping = notes.filter(
      (n) => n.startTick < end && n.startTick + n.duration > start,
    );
    if (overlapping.length > 0) {
      const lowestPitch = Math.min(...overlapping.map((n) => n.pitch));
      slices.push({
        startTick: start,
        endTick: end,
        notes: overlapping,
        bassPc: ((lowestPitch % 12) + 12) % 12,
      });
    }
  }
  return slices;
}

// ─── Step 2: Local scoring (pitch class fit only) ────────

function scoreSlice(slice: TimeSlice): number[] {
  const pcWeight = new Float64Array(12);
  let totalWeight = 0;

  for (const n of slice.notes) {
    const pc = ((n.pitch % 12) + 12) % 12;
    const effectiveStart = Math.max(n.startTick, slice.startTick);
    const effectiveEnd = Math.min(n.startTick + n.duration, slice.endTick);
    const w = effectiveEnd - effectiveStart;
    if (w <= 0) continue;
    pcWeight[pc] += w;
    totalWeight += w;
  }

  if (totalWeight === 0) return new Array(NUM_CANDIDATES).fill(0);

  const scores = new Array(NUM_CANDIDATES);
  for (let i = 0; i < NUM_CANDIDATES; i++) {
    const scaleSet = CANDIDATE_PC_SETS[i];
    let inScaleW = 0;
    for (let pc = 0; pc < 12; pc++) {
      if (pcWeight[pc] > 0 && scaleSet.has(pc)) inScaleW += pcWeight[pc];
    }
    scores[i] = inScaleW / totalWeight;
  }
  return scores;
}

// ─── Step 3: Forward-backward smoothing ──────────────────

function smooth(
  localScores: number[][],
  distMatrix: number[][],
  transitionSharpness: number,
): number[][] {
  const T = localScores.length;
  const K = NUM_CANDIDATES;
  if (T === 0) return [];

  const trans: number[][] = Array.from({ length: K }, (_, i) =>
    Array.from({ length: K }, (_, j) =>
      Math.exp(-transitionSharpness * distMatrix[i][j]),
    ),
  );

  // Forward
  const fwd: number[][] = Array.from({ length: T }, () => new Array(K).fill(0));
  for (let k = 0; k < K; k++) fwd[0][k] = localScores[0][k];
  normalize(fwd[0]);

  for (let t = 1; t < T; t++) {
    for (let k = 0; k < K; k++) {
      let sum = 0;
      for (let prev = 0; prev < K; prev++) sum += fwd[t - 1][prev] * trans[prev][k];
      fwd[t][k] = sum * localScores[t][k];
    }
    normalize(fwd[t]);
  }

  // Backward
  const bwd: number[][] = Array.from({ length: T }, () => new Array(K).fill(0));
  for (let k = 0; k < K; k++) bwd[T - 1][k] = 1;
  normalize(bwd[T - 1]);

  for (let t = T - 2; t >= 0; t--) {
    for (let k = 0; k < K; k++) {
      let sum = 0;
      for (let next = 0; next < K; next++)
        sum += bwd[t + 1][next] * trans[k][next] * localScores[t + 1][next];
      bwd[t][k] = sum;
    }
    normalize(bwd[t]);
  }

  // Posterior
  const posterior: number[][] = Array.from({ length: T }, () => new Array(K).fill(0));
  for (let t = 0; t < T; t++) {
    for (let k = 0; k < K; k++) posterior[t][k] = fwd[t][k] * bwd[t][k];
    normalize(posterior[t]);
  }

  return posterior;
}

function normalize(arr: number[]): void {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  if (sum > 0) for (let i = 0; i < arr.length; i++) arr[i] /= sum;
}

// ─── Step 4: Global tonic disambiguation ─────────────────

/**
 * Compute a global tonic multiplier for each of the 72 candidates.
 *
 * Signals:
 *   1. Bass frequency: how often each PC appears as bass across all slices
 *   2. V→I resolution: consecutive bass notes forming dominant→tonic
 *   3. Position: first/last slice bass note
 *
 * These multipliers redistribute probability WITHIN groups of candidates
 * that share the same pitch class set, so they don't fight the HMM smoothing.
 */
function computeTonicMultipliers(slices: TimeSlice[]): Float64Array {
  const T = slices.length;
  const multipliers = new Float64Array(NUM_CANDIDATES).fill(1);
  if (T === 0) return multipliers;

  // Signal 1: Bass note frequency
  // Count how many slices have each PC as bass
  const bassCount = new Float64Array(12);
  for (const s of slices) bassCount[s.bassPc]++;

  // Signal 2: V→I resolutions
  // For each candidate, count how many times bass[t]=dominant, bass[t+1]=root
  const resolutionCount = new Float64Array(NUM_CANDIDATES);
  for (let t = 0; t < T - 1; t++) {
    const curBass = slices[t].bassPc;
    const nextBass = slices[t + 1].bassPc;
    for (let i = 0; i < NUM_CANDIDATES; i++) {
      if (curBass === CANDIDATE_DOMINANTS[i] && nextBass === CANDIDATE_ROOTS[i]) {
        resolutionCount[i]++;
      }
    }
  }

  // Signal 3: First/last slice bass
  const firstBass = slices[0].bassPc;
  const lastBass = slices[T - 1].bassPc;

  // Combine signals into multiplier per candidate
  for (let i = 0; i < NUM_CANDIDATES; i++) {
    const root = CANDIDATE_ROOTS[i];
    let m = 1;

    // Bass frequency: how often does this candidate's root appear as bass?
    // Normalized by total slices. Max bonus ≈ 2× for root that's bass in every slice.
    const bassRatio = bassCount[root] / T;
    m *= 1 + bassRatio * 1.5;

    // V→I: each resolution is a strong signal. Bonus scales with count.
    if (resolutionCount[i] > 0) {
      m *= 1 + resolutionCount[i] * 0.8;
    }

    // Position: first/last bass matching root
    if (firstBass === root) m *= 1.3;
    if (lastBass === root) m *= 1.3;

    multipliers[i] = m;
  }

  // Normalize multipliers WITHIN each PC-set group so that
  // total probability within a group is preserved (only redistribution).
  for (const group of PC_SET_GROUPS.values()) {
    let groupSum = 0;
    for (const idx of group) groupSum += multipliers[idx];
    const avgM = groupSum / group.length;
    if (avgM > 0) {
      for (const idx of group) multipliers[idx] /= avgM;
    }
  }

  return multipliers;
}

/**
 * Apply tonic multipliers to posteriors and re-normalize.
 */
function applyTonicMultipliers(
  posteriors: number[][],
  multipliers: Float64Array,
): void {
  for (const row of posteriors) {
    for (let i = 0; i < NUM_CANDIDATES; i++) row[i] *= multipliers[i];
    normalize(row);
  }
}

// ─── Step 5: Global ranking ──────────────────────────────

function computeGlobalRanking(segments: SegmentResult[]): RankedKey[] {
  if (segments.length === 0) return [];

  const avgProb = new Float64Array(NUM_CANDIDATES);
  for (const seg of segments) {
    for (let i = 0; i < NUM_CANDIDATES; i++) avgProb[i] += seg.probs[i];
  }
  for (let i = 0; i < NUM_CANDIDATES; i++) avgProb[i] /= segments.length;

  const ranked: RankedKey[] = [];
  for (let i = 0; i < NUM_CANDIDATES; i++) {
    ranked.push({
      root: CANDIDATES[i].root,
      mode: CANDIDATES[i].mode,
      confidence: avgProb[i],
      candidateIdx: i,
    });
  }
  ranked.sort((a, b) => b.confidence - a.confidence);
  return ranked;
}

// ─── Public API ──────────────────────────────────────────

export interface TonalSegmentationOptions {
  sliceWidth?: number;
  transitionSharpness?: number;
  atonalThreshold?: number;
  ambiguityGap?: number;
}

export function analyzeTonalSegments(
  notes: SimpleNote[],
  ticksPerBeat: number,
  options: TonalSegmentationOptions = {},
): TonalSegmentationResult {
  const sliceWidth = options.sliceWidth ?? ticksPerBeat * 4;
  const transitionSharpness = options.transitionSharpness ?? 8;
  const atonalThreshold = options.atonalThreshold ?? ATONAL_THRESHOLD;
  const ambiguityGap = options.ambiguityGap ?? AMBIGUITY_GAP;

  const slices = sliceByTime(notes, sliceWidth);
  const T = slices.length;

  if (T === 0) {
    return {
      candidates: CANDIDATES,
      segments: [],
      distanceMatrix: DISTANCE_MATRIX,
      globalRanking: [],
      isLikelyAtonal: true,
      topConfidence: 0,
      isAmbiguous: false,
    };
  }

  // Step 2: Local scoring (pitch class fit only)
  const localScores = slices.map((s) => scoreSlice(s));

  // Step 3: Forward-backward smooth
  const posteriors = smooth(localScores, DISTANCE_MATRIX, transitionSharpness);

  // Step 4: Global tonic disambiguation
  const tonicMult = computeTonicMultipliers(slices);
  applyTonicMultipliers(posteriors, tonicMult);

  // Build segment results
  const segments: SegmentResult[] = slices.map((slice, t) => {
    const probs = posteriors[t];
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

  // Step 5: Global ranking + flags
  const globalRanking = computeGlobalRanking(segments);
  const topConfidence = globalRanking.length > 0 ? globalRanking[0].confidence : 0;
  const isLikelyAtonal = topConfidence < atonalThreshold;
  const isAmbiguous =
    !isLikelyAtonal &&
    globalRanking.length >= 2 &&
    globalRanking[0].confidence - globalRanking[1].confidence < ambiguityGap;

  return {
    candidates: CANDIDATES,
    segments,
    distanceMatrix: DISTANCE_MATRIX,
    globalRanking,
    isLikelyAtonal,
    topConfidence,
    isAmbiguous,
  };
}

// ─── Utilities ───────────────────────────────────────────

export function candidateName(idx: number): string {
  const c = CANDIDATES[idx];
  return `${NOTE_NAMES[c.root]} ${c.mode}`;
}

export function keyName(root: number, mode: string): string {
  return `${NOTE_NAMES[root]} ${mode}`;
}

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
