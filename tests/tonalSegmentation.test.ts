/**
 * Tonal Segmentation algorithm tests.
 *
 * Run: npx tsx tests/tonalSegmentation.test.ts
 */

import {
  analyzeTonalSegments,
  candidateName,
  keyName,
  collapseToRoots,
  CANDIDATES,
  type TonalSegmentationResult,
} from '../src/utils/tonalSegmentation';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const TPB = 480;
const BAR = TPB * 4;

let totalPass = 0;
let totalFail = 0;

// ─── Helpers ─────────────────────────────────────────────

type SimpleNote = { pitch: number; startTick: number; duration: number };

function chord(bar: number, pitches: number[], dur = BAR): SimpleNote[] {
  return pitches.map((pitch) => ({ pitch, startTick: bar * BAR, duration: dur }));
}

function check(label: string, pass: boolean): void {
  if (pass) totalPass++;
  else totalFail++;
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}`);
}

/** Print segment table + global ranking + flags */
function printResults(label: string, result: TonalSegmentationResult) {
  console.log(`\n${'='.repeat(74)}`);
  console.log(`  ${label}`);
  console.log('='.repeat(74));

  const { rootProbs } = collapseToRoots(result.segments);

  // Find top 4 roots across all segments
  const rootTotals = new Array(12).fill(0);
  for (const rp of rootProbs) {
    for (let r = 0; r < 12; r++) rootTotals[r] += rp[r];
  }
  const topRoots = rootTotals
    .map((total, r) => ({ r, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 4)
    .map((x) => x.r);

  // Header
  const header =
    '  Bar  | ' +
    topRoots.map((r) => NOTE_NAMES[r].padStart(6)).join(' | ') +
    ' | Best';
  console.log(header);
  console.log('  ' + '-'.repeat(header.length - 2));

  for (let i = 0; i < result.segments.length; i++) {
    const seg = result.segments[i];
    const barNum = (seg.startTick / BAR + 1).toString().padStart(3);
    const cells = topRoots.map((r) => {
      const pct = (rootProbs[i][r] * 100).toFixed(1);
      return pct.padStart(5) + '%';
    });
    const best = candidateName(seg.bestIdx);
    const bestPct = (seg.probs[seg.bestIdx] * 100).toFixed(1);
    console.log(`  ${barNum}  | ${cells.join(' | ')} | ${best} (${bestPct}%)`);
  }

  // Regions
  console.log('\n  Regions:');
  let regionStart = 0;
  let regionKey = candidateName(result.segments[0].bestIdx);
  for (let i = 1; i <= result.segments.length; i++) {
    const key =
      i < result.segments.length ? candidateName(result.segments[i].bestIdx) : '';
    if (key !== regionKey) {
      console.log(`    Bar ${regionStart + 1}-${i}: ${regionKey}`);
      regionStart = i;
      regionKey = key;
    }
  }

  // Global ranking (top 5)
  console.log('\n  Global ranking:');
  const top5 = result.globalRanking.slice(0, 5);
  for (let i = 0; i < top5.length; i++) {
    const k = top5[i];
    const name = keyName(k.root, k.mode);
    const pct = (k.confidence * 100).toFixed(2);
    const marker = i === 0 ? ' <--' : '';
    console.log(`    #${i + 1}: ${name.padEnd(20)} ${pct}%${marker}`);
  }

  // Flags
  console.log('');
  console.log(`  Atonal: ${result.isLikelyAtonal}`);
  console.log(`  Ambiguous: ${result.isAmbiguous}`);
  console.log(`  Top confidence: ${(result.topConfidence * 100).toFixed(2)}%`);
  if (result.isAmbiguous && result.globalRanking.length >= 2) {
    const gap = result.globalRanking[0].confidence - result.globalRanking[1].confidence;
    console.log(`  Gap #1-#2: ${(gap * 100).toFixed(3)}%`);
  }
}

// ─── Test 1: Pure C major ────────────────────────────────

function test1_pureCMajor() {
  const notes: SimpleNote[] = [
    ...chord(0, [48, 52, 55, 59]), // Cmaj7
    ...chord(1, [50, 53, 57, 60]), // Dm7
    ...chord(2, [52, 55, 59, 62]), // Em7
    ...chord(3, [53, 57, 60, 64]), // Fmaj7
    ...chord(4, [43, 47, 50, 53]), // G7
    ...chord(5, [45, 48, 52, 55]), // Am7
    ...chord(6, [47, 50, 53, 57]), // Bm7b5
    ...chord(7, [48, 52, 55, 59]), // Cmaj7
  ];

  const result = analyzeTonalSegments(notes, TPB);
  printResults('Test 1: Pure C Major (I-ii-iii-IV-V-vi-vii-I)', result);

  const allC = result.segments.every((s) => CANDIDATES[s.bestIdx].root === 0);
  check('All segments C-rooted', allC);
  check('Global #1 is C major', result.globalRanking[0]?.root === 0 && result.globalRanking[0]?.mode === 'major');
  check('Not atonal', !result.isLikelyAtonal);
}

// ─── Test 2: C major → G major modulation ────────────────

function test2_modulation_C_to_G() {
  const notes: SimpleNote[] = [
    // C major (bars 0-3): Cmaj7 → Dm7 → G7 → Cmaj7
    ...chord(0, [48, 52, 55, 59]),
    ...chord(1, [50, 53, 57, 60]),
    ...chord(2, [43, 47, 50, 53]),
    ...chord(3, [48, 52, 55, 59]),
    // G major (bars 4-7): Gmaj7 → Am7 → D7 → Gmaj7
    ...chord(4, [43, 47, 50, 54]),
    ...chord(5, [45, 49, 52, 55]),
    ...chord(6, [50, 54, 57, 60]),
    ...chord(7, [43, 47, 50, 54]),
  ];

  const result = analyzeTonalSegments(notes, TPB);
  printResults('Test 2: C Major -> G Major Modulation', result);

  const firstHalf = result.segments.slice(0, 4).every((s) => CANDIDATES[s.bestIdx].root === 0);
  const secondHalf = result.segments.slice(4).every((s) => CANDIDATES[s.bestIdx].root === 7);
  check('Bars 1-4: C-rooted', firstHalf);
  check('Bars 5-8: G-rooted (not D mixolydian)', secondHalf);
}

// ─── Test 3: ii-V-I in multiple keys ────────────────────

function test3_iiVI_multipleKeys() {
  const notes: SimpleNote[] = [
    // ii-V-I in C
    ...chord(0, [50, 53, 57, 60]), // Dm7
    ...chord(1, [43, 47, 50, 53]), // G7
    ...chord(2, [48, 52, 55, 59]), // Cmaj7
    // ii-V-I in F
    ...chord(3, [43, 48, 51, 55]), // Gm7
    ...chord(4, [48, 52, 55, 58]), // C7
    ...chord(5, [53, 57, 60, 64]), // Fmaj7
    // ii-V-I in Bb
    ...chord(6, [48, 51, 55, 58]), // Cm7
    ...chord(7, [41, 45, 48, 51]), // F7
    ...chord(8, [46, 50, 53, 57]), // Bbmaj7
  ];

  const result = analyzeTonalSegments(notes, TPB);
  printResults('Test 3: ii-V-I in C -> F -> Bb', result);

  const region1 = result.segments.slice(0, 3).every((s) => CANDIDATES[s.bestIdx].root === 0);
  const region2 = result.segments.slice(3, 6).every((s) => CANDIDATES[s.bestIdx].root === 5);
  const region3 = result.segments.slice(6, 9).every((s) => CANDIDATES[s.bestIdx].root === 10);
  check('Bars 1-3: C (not D mixolydian)', region1);
  check('Bars 4-6: F (not C mixolydian)', region2);
  check('Bars 7-9: Bb (not C dorian)', region3);
}

// ─── Test 4: Blues ───────────────────────────────────────

function test4_blues() {
  const notes: SimpleNote[] = [
    ...chord(0, [48, 52, 55, 58]),  // C7
    ...chord(1, [48, 52, 55, 58]),
    ...chord(2, [48, 52, 55, 58]),
    ...chord(3, [48, 52, 55, 58]),
    ...chord(4, [53, 57, 60, 63]),  // F7
    ...chord(5, [53, 57, 60, 63]),
    ...chord(6, [48, 52, 55, 58]),  // C7
    ...chord(7, [48, 52, 55, 58]),
    ...chord(8, [43, 47, 50, 53]),  // G7
    ...chord(9, [53, 57, 60, 63]),  // F7
    ...chord(10, [48, 52, 55, 58]), // C7
    ...chord(11, [48, 52, 55, 58]),
  ];

  const result = analyzeTonalSegments(notes, TPB);
  printResults('Test 4: 12-Bar Blues in C', result);

  const cRooted = result.segments.filter((s) => CANDIDATES[s.bestIdx].root === 0).length;
  check(`${cRooted}/12 segments C-rooted (expect majority)`, cRooted >= 6);
  check('Global #1 is C-rooted', result.globalRanking[0]?.root === 0);
  check('Not atonal', !result.isLikelyAtonal);
}

// ─── Test 5: Chromatic / atonal ──────────────────────────

function test5_chromatic() {
  const notes: SimpleNote[] = [];
  for (let bar = 0; bar < 4; bar++) {
    for (let pc = 0; pc < 12; pc++) {
      notes.push({ pitch: 48 + pc, startTick: bar * BAR, duration: BAR });
    }
  }

  const result = analyzeTonalSegments(notes, TPB);
  printResults('Test 5: Chromatic (all 12 notes equal)', result);

  check('Flagged as atonal', result.isLikelyAtonal);
  const maxProb = Math.max(...result.segments.flatMap((s) => s.probs));
  check(`Max confidence ${(maxProb * 100).toFixed(1)}% is low`, maxProb < 0.1);
}

// ─── Test 6: Jazz demo ──────────────────────────────────

function test6_jazzDemo() {
  const notes: SimpleNote[] = [
    ...chord(0,  [48, 52, 55, 59]),  // Cmaj7
    ...chord(1,  [47, 50, 53, 57]),  // Bm7b5
    ...chord(2,  [52, 56, 59, 62]),  // E7
    ...chord(3,  [45, 48, 52, 55]),  // Am7
    ...chord(4,  [50, 53, 57, 60]),  // Dm7
    ...chord(5,  [43, 47, 50, 53]),  // G7
    ...chord(6,  [48, 52, 55, 59]),  // Cmaj7
    ...chord(7,  [48, 52, 55, 58]),  // C7
    ...chord(8,  [53, 57, 60, 64]),  // Fmaj7
    ...chord(9,  [53, 56, 60, 63]),  // Fm7
    ...chord(10, [52, 55, 59, 62]),  // Em7
    ...chord(11, [45, 49, 52, 55]),  // A7
    ...chord(12, [50, 53, 57, 60]),  // Dm7
    ...chord(13, [49, 53, 56, 59]),  // Db7
    ...chord(14, [48, 52, 55, 59]),  // Cmaj7
    ...chord(15, [43, 47, 50, 53]),  // G7
  ];

  const result = analyzeTonalSegments(notes, TPB);
  printResults('Test 6: Jazz Demo (16-bar)', result);

  const cRooted = result.segments.filter((s) => CANDIDATES[s.bestIdx].root === 0).length;
  check(`${cRooted}/16 segments C-rooted`, cRooted >= 10);
  check('Global #1 is C major', result.globalRanking[0]?.root === 0 && result.globalRanking[0]?.mode === 'major');
}

// ─── Test 7: Distant modulation C → F# ──────────────────

function test7_distantModulation() {
  const notes: SimpleNote[] = [
    ...chord(0, [48, 52, 55]),  // C
    ...chord(1, [53, 57, 60]),  // F
    ...chord(2, [43, 47, 50]),  // G
    ...chord(3, [48, 52, 55]),  // C
    ...chord(4, [42, 46, 49]),  // F#
    ...chord(5, [47, 51, 54]),  // B
    ...chord(6, [37, 41, 44]),  // C#
    ...chord(7, [42, 46, 49]),  // F#
  ];

  const result = analyzeTonalSegments(notes, TPB);
  printResults('Test 7: Distant Modulation C -> F#', result);

  const firstHalf = result.segments.slice(0, 4).every((s) => CANDIDATES[s.bestIdx].root === 0);
  const secondHalf = result.segments.slice(4).every((s) => CANDIDATES[s.bestIdx].root === 6);
  check('Bars 1-4: C', firstHalf);
  check('Bars 5-8: F#', secondHalf);
}

// ─── Test 8: Ambiguity — C major vs A minor ─────────────

function test8_ambiguity() {
  // Deliberately ambiguous: Am → Dm → G → C → Am → Em → Am
  // Could be C major or A minor
  const notes: SimpleNote[] = [
    ...chord(0, [45, 48, 52]),  // Am
    ...chord(1, [50, 53, 57]),  // Dm
    ...chord(2, [43, 47, 50]),  // G
    ...chord(3, [48, 52, 55]),  // C
    ...chord(4, [45, 48, 52]),  // Am
    ...chord(5, [52, 55, 59]),  // Em
    ...chord(6, [45, 48, 52]),  // Am
    ...chord(7, [45, 48, 52]),  // Am
  ];

  const result = analyzeTonalSegments(notes, TPB);
  printResults('Test 8: Ambiguous C major / A minor', result);

  // Should be ambiguous OR A minor (Am appears most, starts & ends on Am)
  const top2roots = new Set([result.globalRanking[0]?.root, result.globalRanking[1]?.root]);
  check('Top 2 includes both C(0) and A(9)', top2roots.has(0) && top2roots.has(9));
  check('Not atonal', !result.isLikelyAtonal);
  // With bass/start/end bonuses, A minor should win (bass A in 5/8 bars, starts & ends Am)
  check('Global #1 is A-rooted (bass+position signals)', result.globalRanking[0]?.root === 9);
}

// ─── Test 9: Single chord (edge case) ───────────────────

function test9_singleChord() {
  const notes: SimpleNote[] = chord(0, [48, 52, 55, 59]); // Cmaj7

  const result = analyzeTonalSegments(notes, TPB);
  printResults('Test 9: Single Chord (Cmaj7)', result);

  check('Global #1 is C-rooted', result.globalRanking[0]?.root === 0);
  check('Not atonal', !result.isLikelyAtonal);
}

// ─── Test 10: Empty input ────────────────────────────────

function test10_empty() {
  const result = analyzeTonalSegments([], TPB);
  console.log(`\n${'='.repeat(74)}`);
  console.log('  Test 10: Empty input');
  console.log('='.repeat(74));
  check('No segments', result.segments.length === 0);
  check('Flagged as atonal', result.isLikelyAtonal);
  check('Top confidence is 0', result.topConfidence === 0);
}

// ─── Run all tests ───────────────────────────────────────

console.log('\nTonal Segmentation Algorithm Tests (v2: tonic detection + atonal)');
console.log('=================================================================\n');

test1_pureCMajor();
test2_modulation_C_to_G();
test3_iiVI_multipleKeys();
test4_blues();
test5_chromatic();
test6_jazzDemo();
test7_distantModulation();
test8_ambiguity();
test9_singleChord();
test10_empty();

console.log(`\n${'='.repeat(74)}`);
console.log(`  Results: ${totalPass} passed, ${totalFail} failed`);
console.log('='.repeat(74));
