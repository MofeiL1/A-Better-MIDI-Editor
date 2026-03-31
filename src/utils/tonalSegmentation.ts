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
  /**
   * What % of this segment's notes (weighted by count×duration) fall within
   * the detected key's scale. 0.95 = 95% of notes in-scale (very clear),
   * 0.60 = only 60% fit (chromatic/transitional). Directly meaningful to users.
   */
  certainty: number;
  /**
   * True if this segment could be a pivot chord: it sits at a boundary
   * between two different key regions and fits both keys reasonably well.
   */
  isPivot: boolean;
  /** If isPivot, the keys on each side: [before, after]. null otherwise. */
  pivotBetween: [{ root: number; mode: string }, { root: number; mode: string }] | null;
};

export type RankedKey = {
  root: number;
  mode: string;
  confidence: number;
  candidateIdx: number;
};

/** Binary probability for a specific key: "P(this region IS in this key)". */
export type KeyProbability = {
  root: number;
  mode: string;
  /**
   * Binary probability: "how likely is it that this region is in this key?"
   * = fitScore × tonicConfidence
   *
   * fitScore: what % of the region's notes (weighted) fall in this key's scale.
   * tonicConfidence: how strongly bass/V→I/position signals point to this root
   *   as the tonic (normalized within same-pitch-class-set groups).
   *
   * These DO NOT sum to 100% across keys — each key is an independent
   * yes/no question. C major = 92% and A minor = 78% can coexist.
   */
  probability: number;
  /** The raw fit score component (0-1): what % of notes are in-scale */
  fitScore: number;
  /** The tonic confidence component (0-1): how likely this is the tonic */
  tonicConfidence: number;
};

/** A contiguous region with a consistent tonal center. */
export type TonalRegion = {
  startTick: number;
  endTick: number;
  startBar: number;  // 0-indexed bar number
  endBar: number;    // inclusive
  type: 'stable' | 'transition';
  /** Top key candidates with binary probabilities (independent, don't sum to 100%) */
  keyProbabilities: KeyProbability[];
  /** Shortcut: best key */
  bestKey: { root: number; mode: string };
  /** P(this region IS in bestKey) — the headline number users see (e.g. 0.92 = "92%") */
  bestKeyProbability: number;
  /** True if bestKey and #2 are close — suggest user confirmation */
  isAmbiguous: boolean;
  /** The per-bar segments that belong to this region */
  segmentIndices: number[];
};

export type TonalSegmentationResult = {
  candidates: KeyCandidate[];
  segments: SegmentResult[];
  /** Detected tonal regions with per-region Bayesian key probabilities */
  regions: TonalRegion[];
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

// ─── Step 4: Region-based tonic disambiguation ──────────

/** Whether a mode belongs to the major family (tiebreaker: prefer major). */
const MAJOR_FAMILY_MODES = new Set(['major', 'mixolydian', 'melodic minor']);

/**
 * After HMM smoothing, identify contiguous regions sharing the same
 * winning pitch-class-set, then compute tonic signals per region.
 *
 * This avoids both problems:
 *   - Global tonic (v3): modulation bleeds tonic signal across sections
 *   - Per-bar tonic (v4): too noisy, each bar follows its own bass
 *
 * Within each region, signals used:
 *   1. Bass note frequency (how often each PC is the lowest note)
 *   2. V→I resolutions (consecutive bass = dominant → tonic)
 *   3. Edge position (first/last bar of the whole piece)
 *   4. Major preference (mild boost for major-family modes)
 */
function applyRegionTonicDisambiguation(
  posteriors: number[][],
  slices: TimeSlice[],
): void {
  const T = slices.length;
  if (T === 0) return;

  // Find the winning PC-set key at each segment (before tonic disambiguation)
  function pcSetKeyOf(segIdx: number): string {
    // Find the best candidate for this segment
    let bestIdx = 0;
    for (let i = 1; i < NUM_CANDIDATES; i++) {
      if (posteriors[segIdx][i] > posteriors[segIdx][bestIdx]) bestIdx = i;
    }
    return [...CANDIDATE_PC_SETS[bestIdx]].sort((a, b) => a - b).join(',');
  }

  // Identify contiguous regions of the same PC set
  type Region = { start: number; end: number; pcKey: string };
  const regions: Region[] = [];
  let regionStart = 0;
  let regionPcKey = pcSetKeyOf(0);

  for (let t = 1; t <= T; t++) {
    const pcKey = t < T ? pcSetKeyOf(t) : '';
    if (pcKey !== regionPcKey) {
      regions.push({ start: regionStart, end: t - 1, pcKey: regionPcKey });
      regionStart = t;
      regionPcKey = pcKey;
    }
  }

  // For each region, compute tonic multipliers and apply
  for (const region of regions) {
    const rLen = region.end - region.start + 1;

    // Signal 1: Bass frequency in this region
    const bassCount = new Float64Array(12);
    for (let t = region.start; t <= region.end; t++) {
      bassCount[slices[t].bassPc]++;
    }

    // Signal 2: V→I resolutions in this region
    const resCount = new Float64Array(NUM_CANDIDATES);
    for (let t = region.start; t < region.end; t++) {
      const curBass = slices[t].bassPc;
      const nextBass = slices[t + 1].bassPc;
      for (let i = 0; i < NUM_CANDIDATES; i++) {
        if (curBass === CANDIDATE_DOMINANTS[i] && nextBass === CANDIDATE_ROOTS[i]) {
          resCount[i]++;
        }
      }
    }

    // Build multiplier for candidates in this region's PC-set group
    const group = PC_SET_GROUPS.get(region.pcKey);
    if (!group || group.length <= 1) continue; // no ambiguity to resolve

    const mult = new Float64Array(NUM_CANDIDATES).fill(1);
    for (const i of group) {
      const root = CANDIDATE_ROOTS[i];
      let m = 1;

      // Bass frequency
      const bassRatio = bassCount[root] / rLen;
      m *= 1 + bassRatio * 1.5;

      // V→I resolutions
      if (resCount[i] > 0) m *= 1 + resCount[i] * 0.8;

      // Edge: first/last bar of entire piece
      if (region.start === 0 && slices[0].bassPc === root) m *= 1.3;
      if (region.end === T - 1 && slices[T - 1].bassPc === root) m *= 1.3;

      // Major preference
      if (MAJOR_FAMILY_MODES.has(CANDIDATES[i].mode)) m *= 1.1;

      mult[i] = m;
    }

    // Normalize within the group
    let groupSum = 0;
    for (const idx of group) groupSum += mult[idx];
    const avg = groupSum / group.length;
    if (avg > 0) {
      for (const idx of group) mult[idx] /= avg;
    }

    // Apply to all segments in this region
    for (let t = region.start; t <= region.end; t++) {
      for (const idx of group) posteriors[t][idx] *= mult[idx];
      normalize(posteriors[t]);
    }
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
      regions: [],
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

  // Step 4: Region-based tonic disambiguation
  applyRegionTonicDisambiguation(posteriors, slices);

  // Build segment results with certainty scores
  // Compute local fit scores for certainty display
  const fitScores = slices.map((s) => scoreSlice(s));

  const segments: SegmentResult[] = slices.map((slice, t) => {
    const probs = posteriors[t];
    let bestIdx = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > probs[bestIdx]) bestIdx = i;
    }

    // Certainty = what % of this segment's notes (weighted by count×duration)
    // fall within the detected key's scale. This is the direct musical answer
    // to "how well does this key fit the notes here?"
    // 95% = almost all notes in-scale, 60% = lots of out-of-scale notes.
    const certainty = fitScores[t][bestIdx];

    return {
      startTick: slice.startTick,
      endTick: slice.endTick,
      probs,
      bestIdx,
      certainty,
      isPivot: false,       // filled in next step
      pivotBetween: null,
    };
  });

  // Detect pivot chords: segments at key-change boundaries that fit both keys
  const PIVOT_FIT_THRESHOLD = 0.5; // candidate must have ≥ 50% of best's prob
  for (let t = 1; t < segments.length; t++) {
    const prev = segments[t - 1];
    const curr = segments[t];
    const prevKey = CANDIDATES[prev.bestIdx];
    const currKey = CANDIDATES[curr.bestIdx];

    // Different best key from previous segment?
    if (prev.bestIdx === curr.bestIdx) continue;

    // Check if current segment also fits the previous key reasonably well
    const currBestProb = curr.probs[curr.bestIdx];
    const currPrevProb = curr.probs[prev.bestIdx];
    const fitsOldKey = currPrevProb >= currBestProb * PIVOT_FIT_THRESHOLD;

    // Check if previous segment also fits the current key reasonably well
    const prevBestProb = prev.probs[prev.bestIdx];
    const prevCurrProb = prev.probs[curr.bestIdx];
    const fitsNewKey = prevCurrProb >= prevBestProb * PIVOT_FIT_THRESHOLD;

    if (fitsOldKey) {
      // Current segment is a pivot: it belongs to the new key but also fits the old
      curr.isPivot = true;
      curr.pivotBetween = [
        { root: prevKey.root, mode: prevKey.mode },
        { root: currKey.root, mode: currKey.mode },
      ];
    }
    if (fitsNewKey && !curr.isPivot) {
      // Previous segment is actually the pivot
      prev.isPivot = true;
      prev.pivotBetween = [
        { root: prevKey.root, mode: prevKey.mode },
        { root: currKey.root, mode: currKey.mode },
      ];
    }
  }

  // Step 5: Global ranking + flags
  const globalRanking = computeGlobalRanking(segments);
  const topConfidence = globalRanking.length > 0 ? globalRanking[0].confidence : 0;

  // Atonal check: use median of per-segment best confidence.
  // A modulating piece (C→F#) has high per-segment confidence even though
  // the global average is low. Only flag atonal if most segments are uncertain.
  const segBestConfs = segments.map((s) => s.probs[s.bestIdx]).sort((a, b) => a - b);
  const medianConf = segBestConfs.length > 0
    ? segBestConfs[Math.floor(segBestConfs.length / 2)]
    : 0;
  const isLikelyAtonal = medianConf < atonalThreshold;

  const isAmbiguous =
    !isLikelyAtonal &&
    globalRanking.length >= 2 &&
    globalRanking[0].confidence - globalRanking[1].confidence < ambiguityGap;

  // Step 6: Build tonal regions with Bayesian key probabilities
  const regions = buildRegions(segments, slices, sliceWidth);

  return {
    candidates: CANDIDATES,
    segments,
    regions,
    distanceMatrix: DISTANCE_MATRIX,
    globalRanking,
    isLikelyAtonal,
    topConfidence,
    isAmbiguous,
  };
}

// ─── Step 6: Region building with Bayesian posteriors ────

/**
 * Identify contiguous regions from per-segment results, pool their notes,
 * and compute binary key probabilities for each region.
 *
 * Binary probability = fitScore × tonicConfidence (independent per key).
 *   - fitScore: what % of the region's notes fall in this key's scale (0-1)
 *   - tonicConfidence: how strongly bass/V→I/position signals point to this
 *     root as the tonic, normalized within same-pitch-class-set group (0-1)
 *
 * These do NOT sum to 100% across keys. C major = 92% and A minor = 80%
 * can coexist, because they answer independent questions.
 */
function buildRegions(
  segments: SegmentResult[],
  slices: TimeSlice[],
  sliceWidth: number,
): TonalRegion[] {
  const T = segments.length;
  if (T === 0) return [];

  // Group consecutive segments with the same bestIdx into raw regions
  type RawRegion = { start: number; end: number; mixed: boolean };
  const raw: RawRegion[] = [];
  let rStart = 0;

  for (let t = 1; t <= T; t++) {
    const changed = t === T || segments[t].bestIdx !== segments[t - 1].bestIdx;
    if (changed) {
      raw.push({ start: rStart, end: t - 1, mixed: false });
      rStart = t;
    }
  }

  // Mark single-segment regions between two different keys as "transition"
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (r.end - r.start === 0) {
      // Single-bar region: if its segment is a pivot, mark as transition
      if (segments[r.start].isPivot) {
        r.mixed = true;
      }
    }
  }

  // Build final regions with binary key probabilities
  // Each key gets an independent P(region IS in this key) = fitScore × tonicConfidence
  // These do NOT sum to 100% — they are independent yes/no questions.
  const REGION_AMBIGUITY_GAP = 0.10; // best - #2 < 10% → ambiguous

  const regions: TonalRegion[] = [];

  for (const r of raw) {
    // Pool all notes from slices in this region
    const pooledNotes: SimpleNote[] = [];
    for (let t = r.start; t <= r.end; t++) {
      for (const n of slices[t].notes) {
        pooledNotes.push(n);
      }
    }

    // Compute fit scores for the pooled region (0-1: what % of notes are in-scale)
    const regionSlice: TimeSlice = {
      startTick: slices[r.start].startTick,
      endTick: slices[r.end].endTick,
      notes: pooledNotes,
      bassPc: slices[r.start].bassPc,
    };
    const fitScoresArr = scoreSlice(regionSlice);

    // Compute tonic signals for this region
    const rLen = r.end - r.start + 1;
    const bassCount = new Float64Array(12);
    for (let t = r.start; t <= r.end; t++) bassCount[slices[t].bassPc]++;

    const resCount = new Float64Array(NUM_CANDIDATES);
    for (let t = r.start; t < r.end; t++) {
      const curBass = slices[t].bassPc;
      const nextBass = slices[t + 1].bassPc;
      for (let i = 0; i < NUM_CANDIDATES; i++) {
        if (curBass === CANDIDATE_DOMINANTS[i] && nextBass === CANDIDATE_ROOTS[i]) {
          resCount[i]++;
        }
      }
    }

    // Compute raw tonic multiplier per candidate
    const tonicMult = new Float64Array(NUM_CANDIDATES);
    for (let i = 0; i < NUM_CANDIDATES; i++) {
      const root = CANDIDATE_ROOTS[i];
      let m = 1;
      const bassRatio = bassCount[root] / rLen;
      m *= 1 + bassRatio * 1.5;
      if (resCount[i] > 0) m *= 1 + resCount[i] * 0.8;
      if (r.start === 0 && slices[0].bassPc === root) m *= 1.3;
      if (r.end === T - 1 && slices[T - 1].bassPc === root) m *= 1.3;
      if (MAJOR_FAMILY_MODES.has(CANDIDATES[i].mode)) m *= 1.1;
      tonicMult[i] = m;
    }

    // Normalize tonic multiplier within each PC-set group so max = 1.0
    // This gives tonicConfidence: "among modes sharing these notes,
    // how likely is THIS root the actual tonic?"
    const tonicConf = new Float64Array(NUM_CANDIDATES);
    for (const group of PC_SET_GROUPS.values()) {
      let maxMult = 0;
      for (const idx of group) {
        if (tonicMult[idx] > maxMult) maxMult = tonicMult[idx];
      }
      if (maxMult > 0) {
        for (const idx of group) tonicConf[idx] = tonicMult[idx] / maxMult;
      }
    }

    // Binary probability = fitScore × tonicConfidence
    // Independent per key, does NOT sum to 100%
    const probabilities: KeyProbability[] = [];
    for (let i = 0; i < NUM_CANDIDATES; i++) {
      const fit = fitScoresArr[i];
      const tc = tonicConf[i];
      const prob = fit * tc;
      if (prob > 0.01) { // skip negligible
        probabilities.push({
          root: CANDIDATES[i].root,
          mode: CANDIDATES[i].mode,
          probability: prob,
          fitScore: fit,
          tonicConfidence: tc,
        });
      }
    }
    probabilities.sort((a, b) => b.probability - a.probability);

    const bestKey = probabilities.length > 0
      ? { root: probabilities[0].root, mode: probabilities[0].mode }
      : { root: 0, mode: 'major' };
    const bestProb = probabilities.length > 0 ? probabilities[0].probability : 0;
    const secondProb = probabilities.length > 1 ? probabilities[1].probability : 0;

    const segIndices: number[] = [];
    for (let t = r.start; t <= r.end; t++) segIndices.push(t);

    regions.push({
      startTick: slices[r.start].startTick,
      endTick: slices[r.end].endTick,
      startBar: r.start,
      endBar: r.end,
      type: r.mixed ? 'transition' : 'stable',
      keyProbabilities: probabilities.slice(0, 10),
      bestKey,
      bestKeyProbability: bestProb,
      isAmbiguous: bestProb - secondProb < REGION_AMBIGUITY_GAP,
      segmentIndices: segIndices,
    });
  }

  return regions;
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
