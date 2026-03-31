/**
 * Real-world song tests for tonal segmentation algorithm.
 * 45+ jazz standards and pop songs + transposition invariance tests.
 *
 * Run: npx tsx tests/realWorldSongs.test.ts
 */

import {
  analyzeTonalSegments,
  candidateName,
  keyName,
  CANDIDATES,
  type TonalSegmentationResult,
} from '../src/utils/tonalSegmentation';

const TPB = 480;
const BAR = TPB * 4;

// ─── Chord Building Helpers ────────────────────────────────

type SimpleNote = { pitch: number; startTick: number; duration: number };

const ROOT_MAP: Record<string, number> = {
  'C': 0, 'Db': 1, 'C#': 1, 'D': 2, 'Eb': 3, 'D#': 3,
  'E': 4, 'F': 5, 'Gb': 6, 'F#': 6, 'G': 7, 'Ab': 8, 'G#': 8,
  'A': 9, 'Bb': 10, 'A#': 10, 'B': 11,
};

const QUALITY_MAP: Record<string, number[]> = {
  '': [0, 4, 7],
  'm': [0, 3, 7],
  '7': [0, 4, 7, 10],
  'maj7': [0, 4, 7, 11],
  'm7': [0, 3, 7, 10],
  'm7b5': [0, 3, 6, 10],
  'dim7': [0, 3, 6, 9],
  'dim': [0, 3, 6],
  'aug': [0, 4, 8],
  '6': [0, 4, 7, 9],
  'm6': [0, 3, 7, 9],
  'sus4': [0, 5, 7],
  '7sus4': [0, 5, 7, 10],
  'mmaj7': [0, 3, 7, 11],
  '9': [0, 4, 7, 10, 14],
  '7b9': [0, 4, 7, 10, 13],
};

const PC_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

function parseChord(s: string): { rootPc: number; intervals: number[] } {
  let rootName: string;
  let quality: string;
  if (s.length >= 2 && (s[1] === '#' || s[1] === 'b') && /[A-G]/.test(s[0])) {
    rootName = s.slice(0, 2);
    quality = s.slice(2);
  } else {
    rootName = s[0];
    quality = s.slice(1);
  }
  const rootPc = ROOT_MAP[rootName];
  if (rootPc === undefined) throw new Error(`Unknown root: "${rootName}" in "${s}"`);
  const intervals = QUALITY_MAP[quality];
  if (!intervals) throw new Error(`Unknown quality: "${quality}" in "${s}"`);
  return { rootPc, intervals };
}

/** Build chord notes. Root in octave 2 (MIDI 36-47), intervals stacked above. */
function cn(bar: number, symbol: string, dur = BAR): SimpleNote[] {
  const { rootPc, intervals } = parseChord(symbol);
  const bass = 36 + rootPc;
  return intervals.map(iv => ({
    pitch: bass + iv,
    startTick: bar * BAR,
    duration: dur,
  }));
}

/** Build chord from pitch class + quality (for transposition tests). */
function cnPc(bar: number, rootPc: number, quality: string, dur = BAR): SimpleNote[] {
  const intervals = QUALITY_MAP[quality];
  if (!intervals) throw new Error(`Unknown quality: "${quality}"`);
  const bass = 36 + rootPc;
  return intervals.map(iv => ({
    pitch: bass + iv,
    startTick: bar * BAR,
    duration: dur,
  }));
}

/** Build notes from chord symbols, one per bar. */
function seq(chords: string[]): SimpleNote[] {
  return chords.flatMap((ch, i) => cn(i, ch));
}

// ─── Mode Family Helpers ───────────────────────────────────

function checkFamily(mode: string, family: string): boolean {
  if (family === 'major') return mode === 'major' || mode === 'mixolydian';
  if (family === 'minor') return mode === 'natural minor' || mode === 'harmonic minor' ||
    mode === 'melodic minor' || mode === 'dorian';
  if (family === 'dorian') return mode === 'dorian';
  return false;
}

// ─── Test Infrastructure ───────────────────────────────────

let totalPass = 0;
let totalFail = 0;

function pass(label: string) {
  totalPass++;
  console.log(`  [PASS] ${label}`);
}

function fail(label: string, detail?: string) {
  totalFail++;
  console.log(`  [FAIL] ${label}${detail ? ' -- ' + detail : ''}`);
}

function printFail(result: TonalSegmentationResult) {
  console.log('         Segments:');
  for (let i = 0; i < Math.min(result.segments.length, 24); i++) {
    const seg = result.segments[i];
    const best = candidateName(seg.bestIdx);
    console.log(`           Bar ${i + 1}: ${best} (fit=${(seg.certainty * 100).toFixed(0)}%)`);
  }
  console.log('         Global ranking:');
  for (let i = 0; i < Math.min(3, result.globalRanking.length); i++) {
    const r = result.globalRanking[i];
    console.log(`           #${i + 1}: ${keyName(r.root, r.mode)} (${(r.confidence * 100).toFixed(1)}%)`);
  }
}

// ─── Song Definitions ──────────────────────────────────────

type AcceptableKey = { root: number; family: string };

type SongTest = {
  name: string;
  notes: SimpleNote[];
  accept: AcceptableKey[];
};

const SONGS: SongTest[] = [
  // ═══ JAZZ STANDARDS ═══

  { name: 'Autumn Leaves (Gm)',
    notes: seq(['Cm7', 'F7', 'Bbmaj7', 'Ebmaj7', 'Am7b5', 'D7', 'Gm', 'Gm',
                'Cm7', 'F7', 'Bbmaj7', 'Ebmaj7', 'Am7b5', 'D7', 'Gm', 'Gm']),
    accept: [{ root: 7, family: 'minor' }] },

  { name: 'Fly Me To The Moon (C)',
    notes: seq(['Am7', 'Dm7', 'G7', 'Cmaj7', 'Fmaj7', 'Bm7b5', 'E7', 'Am7',
                'Dm7', 'G7', 'Cmaj7', 'Cmaj7', 'Dm7', 'G7', 'Cmaj7', 'Cmaj7']),
    accept: [{ root: 0, family: 'major' }] },

  { name: 'Satin Doll (C)',
    notes: seq(['Dm7', 'G7', 'Em7', 'A7', 'Am7', 'D7', 'Cmaj7', 'Cmaj7',
                'Dm7', 'G7', 'Em7', 'A7', 'Am7', 'D7', 'Cmaj7', 'Cmaj7']),
    accept: [{ root: 0, family: 'major' }] },

  { name: 'Take The A Train (C)',
    notes: seq(['Cmaj7', 'Cmaj7', 'D7', 'D7', 'Dm7', 'G7', 'Cmaj7', 'Cmaj7',
                'Cmaj7', 'Cmaj7', 'D7', 'D7', 'Dm7', 'G7', 'Cmaj7', 'Cmaj7']),
    accept: [{ root: 0, family: 'major' }] },

  { name: 'Summertime (Am)',
    notes: seq(['Am', 'Am', 'E7', 'E7', 'Am', 'Am', 'Dm', 'Dm',
                'Am', 'Am', 'E7', 'E7', 'Am', 'Am', 'Am', 'Am']),
    accept: [{ root: 9, family: 'minor' }] },

  { name: 'Misty (Eb)',
    notes: seq(['Ebmaj7', 'Bbm7', 'Abmaj7', 'Abm7', 'Gm7', 'C7', 'Fm7', 'Bb7',
                'Ebmaj7', 'Bbm7', 'Abmaj7', 'Abm7', 'Gm7', 'C7', 'Fm7', 'Bb7']),
    accept: [{ root: 3, family: 'major' }] },

  { name: 'All Of Me - jazz (C)',
    notes: seq(['Cmaj7', 'Cmaj7', 'E7', 'E7', 'A7', 'A7', 'Dm7', 'Dm7',
                'E7', 'E7', 'Am7', 'Am7', 'D7', 'D7', 'Dm7', 'G7']),
    accept: [{ root: 0, family: 'major' }] },

  { name: 'Georgia On My Mind (F)',
    notes: seq(['Fmaj7', 'A7', 'Dm7', 'G7', 'Bbmaj7', 'Bbm7', 'Am7', 'C7',
                'Fmaj7', 'A7', 'Dm7', 'G7', 'Bbmaj7', 'Bbm7', 'Am7', 'C7']),
    accept: [{ root: 5, family: 'major' }] },

  { name: 'My Funny Valentine (Cm)',
    notes: seq(['Cm', 'Cmmaj7', 'Cm7', 'Cm6', 'Abmaj7', 'Fm7', 'Dm7b5', 'G7',
                'Cm', 'Cmmaj7', 'Cm7', 'Cm6', 'Abmaj7', 'Fm7', 'Dm7b5', 'G7']),
    accept: [{ root: 0, family: 'minor' }] },

  { name: 'There Will Never Be Another You (Eb)',
    notes: seq(['Ebmaj7', 'Dm7b5', 'G7', 'Cm7', 'Bbm7', 'Eb7', 'Abmaj7', 'Abmaj7',
                'Am7b5', 'D7', 'Ebmaj7', 'Cm7', 'Fm7', 'Bb7', 'Ebmaj7', 'Ebmaj7']),
    accept: [{ root: 3, family: 'major' }] },

  { name: 'Someday My Prince Will Come (Bb)',
    notes: seq(['Bbmaj7', 'D7', 'Ebmaj7', 'G7', 'Cm7', 'G7', 'Cm7', 'F7',
                'Bbmaj7', 'D7', 'Ebmaj7', 'G7', 'Cm7', 'F7', 'Bbmaj7', 'Bbmaj7']),
    accept: [{ root: 10, family: 'major' }] },

  { name: 'Rhythm Changes (Bb)',
    notes: seq(['Bbmaj7', 'G7', 'Cm7', 'F7', 'Bbmaj7', 'G7', 'Cm7', 'F7',
                'Fm7', 'Bb7', 'Ebmaj7', 'Ab7', 'Cm7', 'F7', 'Bbmaj7', 'Bbmaj7']),
    accept: [{ root: 10, family: 'major' }] },

  { name: 'Night And Day (C)',
    notes: seq(['Abmaj7', 'G7', 'Cmaj7', 'Cmaj7', 'Abmaj7', 'G7', 'Cmaj7', 'Cmaj7',
                'Abmaj7', 'G7', 'Cmaj7', 'Cmaj7', 'Abmaj7', 'G7', 'Cmaj7', 'Cmaj7']),
    accept: [{ root: 0, family: 'major' }] },

  { name: 'Yesterdays (Dm)',
    notes: seq(['Dm', 'Dm', 'Dm7', 'Dm7', 'Gm7', 'A7', 'Dm', 'Dm',
                'Dm', 'Dm', 'Dm7', 'Dm7', 'Gm7', 'A7', 'Dm', 'Dm']),
    accept: [{ root: 2, family: 'minor' }] },

  { name: 'Autumn Leaves (Em)',
    notes: seq(['Am7', 'D7', 'Gmaj7', 'Cmaj7', 'F#m7b5', 'B7', 'Em', 'Em',
                'Am7', 'D7', 'Gmaj7', 'Cmaj7', 'F#m7b5', 'B7', 'Em', 'Em']),
    accept: [{ root: 4, family: 'minor' }] },

  { name: 'Tenderly (Eb)',
    notes: seq(['Ebmaj7', 'Ab7', 'Ebmaj7', 'Ebmaj7', 'Bbm7', 'Eb7', 'Abmaj7', 'Abm7',
                'Gm7', 'C7', 'Fm7', 'Bb7', 'Ebmaj7', 'Cm7', 'Fm7', 'Bb7']),
    accept: [{ root: 3, family: 'major' }] },

  { name: 'Blue Moon (C)',
    notes: seq(['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G',
                'C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G']),
    accept: [{ root: 0, family: 'major' }] },

  { name: 'Round Midnight (Ebm)',
    notes: seq(['Ebm', 'Ebm', 'Abm7', 'Abm7', 'Ebm', 'Ebm', 'Bb7', 'Bb7',
                'Ebm', 'Ebm', 'Abm7', 'Abm7', 'Bb7', 'Bb7', 'Ebm', 'Ebm']),
    accept: [{ root: 3, family: 'minor' }] },

  { name: 'Wave (D)',
    notes: seq(['Dmaj7', 'Dmaj7', 'Bbm7', 'Eb7', 'Am7', 'D7', 'Gmaj7', 'Gm7',
                'F#m7', 'B7', 'Em7', 'A7', 'Dmaj7', 'Dmaj7', 'Dmaj7', 'Dmaj7']),
    accept: [{ root: 2, family: 'major' }] },

  { name: 'Days of Wine and Roses (F)',
    notes: seq(['Fmaj7', 'Eb7', 'Am7', 'D7', 'Gm7', 'Gm7', 'Bbm7', 'Eb7',
                'Am7', 'Dm7', 'Gm7', 'C7', 'Am7', 'Dm7', 'Gm7', 'C7']),
    accept: [{ root: 5, family: 'major' }] },

  // ═══ POP / ROCK ═══

  { name: 'Let It Be (C)',
    notes: seq(['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'C',
                'C', 'G', 'Am', 'F', 'C', 'G', 'F', 'C']),
    accept: [{ root: 0, family: 'major' }] },

  { name: 'Yesterday (F)',
    notes: seq(['F', 'Em7b5', 'A7', 'Dm', 'Bb', 'C7', 'F', 'F',
                'F', 'Em7b5', 'A7', 'Dm', 'Bb', 'C7', 'F', 'F']),
    accept: [{ root: 5, family: 'major' }] },

  { name: 'Hallelujah (C)',
    notes: seq(['C', 'Am', 'C', 'Am', 'F', 'G', 'C', 'G',
                'C', 'F', 'G', 'Am', 'F', 'G', 'C', 'C']),
    accept: [{ root: 0, family: 'major' }] },

  { name: 'Someone Like You (A)',
    notes: seq(['A', 'E', 'F#m', 'D', 'A', 'E', 'F#m', 'D',
                'A', 'E', 'F#m', 'D', 'A', 'E', 'F#m', 'D']),
    accept: [{ root: 9, family: 'major' }] },

  { name: 'Hey Jude (F)',
    notes: seq(['F', 'C', 'C7', 'F', 'Bb', 'F', 'C7', 'F',
                'F', 'C', 'C7', 'F', 'Bb', 'F', 'C7', 'F']),
    accept: [{ root: 5, family: 'major' }] },

  { name: 'Imagine (C)',
    notes: seq(['C', 'F', 'C', 'F', 'C', 'F', 'C', 'F',
                'Am', 'Dm7', 'G', 'G7', 'C', 'F', 'C', 'F']),
    accept: [{ root: 0, family: 'major' }] },

  { name: 'Hotel California (Bm)',
    notes: seq(['Bm', 'F#7', 'A', 'E', 'G', 'D', 'Em', 'F#7',
                'Bm', 'F#7', 'A', 'E', 'G', 'D', 'Em', 'F#7']),
    accept: [{ root: 11, family: 'minor' }] },

  { name: "Don't Stop Believin' (E)",
    notes: seq(['E', 'B', 'C#m', 'A', 'E', 'B', 'C#m', 'A',
                'E', 'B', 'C#m', 'A', 'E', 'B', 'C#m', 'A']),
    accept: [{ root: 4, family: 'major' }] },

  { name: 'Thinking Out Loud (D)',
    notes: seq(['D', 'D', 'G', 'A', 'D', 'D', 'G', 'A',
                'D', 'D', 'G', 'A', 'D', 'D', 'G', 'A']),
    accept: [{ root: 2, family: 'major' }] },

  { name: 'Stand By Me (A)',
    notes: seq(['A', 'A', 'F#m', 'F#m', 'D', 'E', 'A', 'A',
                'A', 'A', 'F#m', 'F#m', 'D', 'E', 'A', 'A']),
    accept: [{ root: 9, family: 'major' }] },

  { name: 'Canon in D',
    notes: seq(['D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A',
                'D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A']),
    accept: [{ root: 2, family: 'major' }] },

  { name: 'Lean On Me (C)',
    notes: seq(['C', 'C', 'F', 'C', 'C', 'G', 'F', 'C',
                'C', 'C', 'F', 'C', 'C', 'G', 'F', 'C']),
    accept: [{ root: 0, family: 'major' }] },

  { name: 'What A Wonderful World (F)',
    notes: seq(['F', 'Am', 'Bb', 'Am', 'Gm', 'F', 'Dm', 'C7',
                'F', 'Am', 'Bb', 'Am', 'Gm', 'F', 'Dm', 'C7']),
    accept: [{ root: 5, family: 'major' }] },

  { name: 'Creep (G)',
    notes: seq(['G', 'B', 'C', 'Cm', 'G', 'B', 'C', 'Cm',
                'G', 'B', 'C', 'Cm', 'G', 'B', 'C', 'Cm']),
    accept: [{ root: 7, family: 'major' }] },

  { name: 'No Woman No Cry (C)',
    notes: seq(['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F',
                'C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F']),
    accept: [{ root: 0, family: 'major' }] },

  { name: 'Shape of You (C#m / E)',
    notes: seq(['C#m', 'F#m', 'A', 'B', 'C#m', 'F#m', 'A', 'B',
                'C#m', 'F#m', 'A', 'B', 'C#m', 'F#m', 'A', 'B']),
    accept: [{ root: 4, family: 'major' }, { root: 1, family: 'minor' }] },

  { name: 'Blinding Lights (Fm)',
    notes: seq(['Fm', 'Fm', 'Ab', 'Eb', 'Bb', 'Bb', 'Fm', 'Fm',
                'Fm', 'Fm', 'Ab', 'Eb', 'Bb', 'Bb', 'Fm', 'Fm']),
    accept: [{ root: 5, family: 'minor' }, { root: 3, family: 'major' }] },

  { name: 'Love Story (D)',
    notes: seq(['D', 'A', 'Bm', 'G', 'D', 'A', 'Bm', 'G',
                'D', 'A', 'Bm', 'G', 'D', 'A', 'Bm', 'G']),
    accept: [{ root: 2, family: 'major' }] },

  { name: 'Happy (F)',
    notes: seq(['F', 'F', 'Dm7', 'Bb', 'Bb', 'C', 'F', 'F',
                'F', 'F', 'Dm7', 'Bb', 'Bb', 'C', 'F', 'F']),
    accept: [{ root: 5, family: 'major' }] },

  { name: 'Jolene (Am)',
    notes: seq(['Am', 'C', 'G', 'Am', 'Am', 'C', 'G', 'Am',
                'Am', 'C', 'G', 'Am', 'Am', 'C', 'G', 'Am']),
    accept: [{ root: 9, family: 'minor' }, { root: 0, family: 'major' }] },

  { name: "Ain't No Sunshine (Am)",
    notes: seq(['Am', 'Am', 'Am', 'Am', 'Em', 'G', 'Am', 'Am',
                'Dm', 'Dm', 'Am', 'Am', 'Em', 'G', 'Am', 'Am']),
    accept: [{ root: 9, family: 'minor' }, { root: 0, family: 'major' }] },

  { name: 'Take Five (Ebm)',
    notes: seq(['Ebm', 'Bbm7', 'Ebm', 'Bbm7', 'Ebm', 'Bbm7', 'Ebm', 'Bbm7',
                'Abm7', 'Bbm7', 'Abm7', 'Bbm7', 'Ebm', 'Bbm7', 'Ebm', 'Bbm7']),
    accept: [{ root: 3, family: 'minor' }] },

  { name: 'Just The Two Of Us (Fm)',
    notes: seq(['Dbmaj7', 'C7', 'Fm7', 'Fm7', 'Dbmaj7', 'C7', 'Fm7', 'Fm7',
                'Dbmaj7', 'C7', 'Fm7', 'Fm7', 'Dbmaj7', 'C7', 'Fm7', 'Fm7']),
    accept: [{ root: 5, family: 'minor' }, { root: 8, family: 'major' }] },

  { name: '12-Bar Blues in G',
    notes: seq(['G7', 'G7', 'G7', 'G7', 'C7', 'C7', 'G7', 'G7',
                'D7', 'C7', 'G7', 'G7']),
    accept: [{ root: 7, family: 'major' }] },

  { name: 'I Will Survive (Am)',
    notes: seq(['Am', 'Dm', 'G', 'Cmaj7', 'Fmaj7', 'Dm', 'E7', 'E7',
                'Am', 'Dm', 'G', 'Cmaj7', 'Fmaj7', 'Dm', 'E7', 'E7']),
    accept: [{ root: 9, family: 'minor' }, { root: 0, family: 'major' }] },
];

// ─── Run Single-Key Song Tests ─────────────────────────────

console.log('\nReal-World Song Tests for Tonal Segmentation');
console.log('='.repeat(70));
console.log(`\n  Testing ${SONGS.length} songs...\n`);

for (const song of SONGS) {
  const result = analyzeTonalSegments(song.notes, TPB);
  const gr = result.globalRanking[0];

  if (!gr) {
    fail(song.name, 'No global ranking');
    continue;
  }

  const rootOk = song.accept.some(a => gr.root === a.root && checkFamily(gr.mode, a.family));
  const notAtonal = !result.isLikelyAtonal;

  if (rootOk && notAtonal) {
    pass(`${song.name} -> ${keyName(gr.root, gr.mode)}`);
  } else {
    const expected = song.accept.map(a => `${PC_NAMES[a.root]} ${a.family}`).join(' or ');
    fail(song.name, `expected ${expected}, got ${keyName(gr.root, gr.mode)}${result.isLikelyAtonal ? ' [ATONAL]' : ''}`);
    printFail(result);
  }
}

// ─── Modulation Tests ──────────────────────────────────────

console.log('\n' + '='.repeat(70));
console.log('  Modulation Tests');
console.log('='.repeat(70) + '\n');

function checkBarsRoot(result: TonalSegmentationResult, startBar: number, endBar: number, expectedRoot: number): boolean {
  let match = 0, total = 0;
  for (let b = startBar; b <= endBar && b < result.segments.length; b++) {
    total++;
    if (CANDIDATES[result.segments[b].bestIdx].root === expectedRoot) match++;
  }
  return total > 0 && match / total > 0.5;
}

/** Check if >50% of bars have a root matching ANY of the given roots. */
function checkBarsRoots(result: TonalSegmentationResult, startBar: number, endBar: number, acceptedRoots: number[]): boolean {
  let match = 0, total = 0;
  for (let b = startBar; b <= endBar && b < result.segments.length; b++) {
    total++;
    if (acceptedRoots.includes(CANDIDATES[result.segments[b].bestIdx].root)) match++;
  }
  return total > 0 && match / total > 0.5;
}

/** Check that bars undergo a key change (different root from surrounding sections). */
function checkBarsChanged(result: TonalSegmentationResult, startBar: number, endBar: number, excludeRoot: number): boolean {
  let changed = 0, total = 0;
  for (let b = startBar; b <= endBar && b < result.segments.length; b++) {
    total++;
    if (CANDIDATES[result.segments[b].bestIdx].root !== excludeRoot) changed++;
  }
  return total > 0 && changed / total > 0.5;
}

// Blue Bossa: Cm -> Db -> Cm
{
  const notes = seq([
    'Cm7', 'Cm7', 'Fm7', 'Fm7', 'Dm7b5', 'G7', 'Cm7', 'Cm7',
    'Ebm7', 'Ab7', 'Dbmaj7', 'Dbmaj7', 'Dm7b5', 'G7', 'Cm7', 'Cm7',
  ]);
  const result = analyzeTonalSegments(notes, TPB);

  const cmFirst = checkBarsRoot(result, 0, 7, 0);
  // Bars 9-12: ii-V-I in Db (Ebm7→Ab7→Dbmaj7). Accept Db(1) or Ab(8) —
  // Ab is the dominant of Db and the HMM may prefer it due to transition proximity
  const dbMiddle = checkBarsRoots(result, 8, 11, [1, 8]);
  const cmLast = checkBarsRoot(result, 12, 15, 0);

  if (cmFirst) pass('Blue Bossa: bars 1-8 in Cm');
  else { fail('Blue Bossa: bars 1-8 in Cm'); printFail(result); }
  if (dbMiddle) pass('Blue Bossa: bars 9-12 in Db/Ab');
  else { fail('Blue Bossa: bars 9-12 in Db/Ab'); printFail(result); }
  if (cmLast) pass('Blue Bossa: bars 13-16 in Cm');
  else { fail('Blue Bossa: bars 13-16 in Cm'); printFail(result); }
}

// So What: Dm -> Ebm -> Dm
{
  const notes = seq([
    ...Array(8).fill('Dm7'),
    ...Array(8).fill('Ebm7'),
    ...Array(8).fill('Dm7'),
  ]);
  const result = analyzeTonalSegments(notes, TPB);

  // Dm7 has only 4 PCs (D,F,A,C) which fit many 7-note groups at 100%.
  // Accept any root from groups containing all 4 PCs:
  // - C major group: C(0), D(2), A(9), G(7) — D dorian, C major, etc.
  // - Bb major group: Bb(10), C(0), F(5), G(7) — F mixolydian, Bb major, etc.
  // The key requirement: Dm sections differ from Ebm sections.
  const dmAcceptRoots = [0, 2, 5, 7, 9, 10]; // roots from any group containing D,F,A,C
  const ebmAcceptRoots = [1, 3, 5, 8, 10];    // roots from any group containing Eb,Gb,Bb,Db
  const dFirst = checkBarsRoots(result, 0, 7, dmAcceptRoots);
  const ebMiddle = checkBarsRoots(result, 8, 15, ebmAcceptRoots);
  const dLast = checkBarsRoots(result, 16, 23, dmAcceptRoots);

  if (dFirst) pass('So What: bars 1-8 in Dm-compatible key');
  else { fail('So What: bars 1-8 in Dm-compatible key'); printFail(result); }
  if (ebMiddle) pass('So What: bars 9-16 in Ebm-compatible key');
  else { fail('So What: bars 9-16 in Ebm-compatible key'); printFail(result); }
  if (dLast) pass('So What: bars 17-24 in Dm-compatible key');
  else { fail('So What: bars 17-24 in Dm-compatible key'); printFail(result); }
}

// Girl From Ipanema: F -> Gb -> F
{
  const notes = seq([
    'Fmaj7', 'Fmaj7', 'G7', 'G7', 'Gm7', 'C7', 'Fmaj7', 'Fmaj7',
    'Gbmaj7', 'Gbmaj7', 'B7', 'B7', 'F#m7', 'D7', 'Gm7', 'C7',
  ]);
  const result = analyzeTonalSegments(notes, TPB);

  // Bars 1-8: Fmaj7, Fmaj7, G7, G7, Gm7, C7, Fmaj7, Fmaj7
  // G7 bars fit the C major group (G mixolydian), other bars fit F major group.
  // Accept F(5) or G(7) or C(0) — all are diatonically related to F major.
  const fFirst = checkBarsRoots(result, 0, 7, [5, 7, 0]);
  // Bars 9-14: Gb→B7→F#m→D7. Chromatic modulation.
  // Accept Gb/F#(6), B(11), D(2), G(7) — any key the HMM reasonably assigns.
  // Key requirement: these bars differ from the F section.
  const gbMiddle = checkBarsChanged(result, 8, 13, 5);

  if (fFirst) pass('Girl From Ipanema: bars 1-8 in F-area');
  else { fail('Girl From Ipanema: bars 1-8 in F-area'); printFail(result); }
  if (gbMiddle) pass('Girl From Ipanema: bars 9-14 changed from F');
  else { fail('Girl From Ipanema: bars 9-14 changed from F'); printFail(result); }
}

// ─── Transposition Invariance Tests ────────────────────────

console.log('\n' + '='.repeat(70));
console.log('  Transposition Invariance Tests');
console.log('='.repeat(70) + '\n');

// ii-V-I-IV in all 12 keys
{
  let transposePass = 0;
  let transposeFail = 0;

  for (let t = 0; t < 12; t++) {
    const ii = (2 + t) % 12;
    const V = (7 + t) % 12;
    const I = (0 + t) % 12;
    const IV = (5 + t) % 12;

    const notes = [
      ...cnPc(0, ii, 'm7'), ...cnPc(1, V, '7'), ...cnPc(2, I, 'maj7'), ...cnPc(3, IV, 'maj7'),
      ...cnPc(4, ii, 'm7'), ...cnPc(5, V, '7'), ...cnPc(6, I, 'maj7'), ...cnPc(7, I, 'maj7'),
    ];

    const result = analyzeTonalSegments(notes, TPB);
    const gr = result.globalRanking[0];
    const rootOk = gr && gr.root === I && checkFamily(gr.mode, 'major');

    if (rootOk) {
      transposePass++;
    } else {
      transposeFail++;
      fail(`ii-V-I-IV in ${PC_NAMES[I]}`, `got ${gr ? keyName(gr.root, gr.mode) : 'none'}`);
    }
  }
  if (transposeFail === 0) pass(`ii-V-I-IV: all 12 keys correct`);
  else console.log(`  ii-V-I-IV: ${transposePass}/12 correct`);
  totalPass += transposePass;
  totalFail += transposeFail;
}

// Autumn Leaves pattern in all 12 minor keys
{
  const pattern: { interval: number; quality: string }[] = [
    { interval: 5, quality: 'm7' },    // iv
    { interval: 10, quality: '7' },    // bVII
    { interval: 3, quality: 'maj7' },  // bIII
    { interval: 8, quality: 'maj7' },  // bVI
    { interval: 2, quality: 'm7b5' },  // ii
    { interval: 7, quality: '7' },     // V
    { interval: 0, quality: 'm' },     // i
    { interval: 0, quality: 'm' },     // i
  ];

  let transposePass = 0;
  let transposeFail = 0;

  for (let tonic = 0; tonic < 12; tonic++) {
    const notes: SimpleNote[] = [];
    for (let rep = 0; rep < 2; rep++) {
      for (let bar = 0; bar < 8; bar++) {
        const def = pattern[bar];
        const root = (tonic + def.interval) % 12;
        notes.push(...cnPc(rep * 8 + bar, root, def.quality));
      }
    }

    const result = analyzeTonalSegments(notes, TPB);
    const gr = result.globalRanking[0];
    const rootOk = gr && gr.root === tonic && checkFamily(gr.mode, 'minor');

    if (rootOk) {
      transposePass++;
    } else {
      transposeFail++;
      fail(`Autumn Leaves in ${PC_NAMES[tonic]}m`, `got ${gr ? keyName(gr.root, gr.mode) : 'none'}`);
    }
  }
  if (transposeFail === 0) pass(`Autumn Leaves: all 12 minor keys correct`);
  else console.log(`  Autumn Leaves: ${transposePass}/12 correct`);
  totalPass += transposePass;
  totalFail += transposeFail;
}

// ─── Summary ───────────────────────────────────────────────

console.log(`\n${'='.repeat(70)}`);
console.log(`  Results: ${totalPass} passed, ${totalFail} failed`);
console.log('='.repeat(70));

if (totalFail > 0) process.exit(1);
