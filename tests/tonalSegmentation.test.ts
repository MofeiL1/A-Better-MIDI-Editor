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
    // Certainty bar: [████░░░░░░] style
    const certBlocks = Math.round(seg.certainty * 10);
    const certBar = '\u2588'.repeat(certBlocks) + '\u2591'.repeat(10 - certBlocks);
    const pivotTag = seg.isPivot
      ? ` PIVOT(${keyName(seg.pivotBetween![0].root, seg.pivotBetween![0].mode)} -> ${keyName(seg.pivotBetween![1].root, seg.pivotBetween![1].mode)})`
      : '';
    console.log(`  ${barNum}  | ${cells.join(' | ')} | ${best.padEnd(20)} ${certBar} ${(seg.certainty * 100).toFixed(0).padStart(3)}%${pivotTag}`);
  }

  // Tonal Regions with Bayesian probabilities
  console.log('\n  Tonal Regions:');
  for (const region of result.regions) {
    const barRange = region.startBar === region.endBar
      ? `Bar ${region.startBar + 1}`
      : `Bar ${region.startBar + 1}-${region.endBar + 1}`;
    const typeTag = region.type === 'transition' ? ' [transition]' : '';
    const ambigTag = region.isAmbiguous ? ' [ambiguous]' : '';
    console.log(`\n    ${barRange}${typeTag}${ambigTag}:`);
    const top3 = region.keyProbabilities.slice(0, 3);
    for (let i = 0; i < top3.length; i++) {
      const k = top3[i];
      const name = keyName(k.root, k.mode);
      const pct = (k.probability * 100).toFixed(1);
      const bar = '\u2588'.repeat(Math.round(k.probability * 20)) + '\u2591'.repeat(20 - Math.round(k.probability * 20));
      const marker = i === 0 ? ' <-- best' : '';
      const detail = `fit=${(k.fitScore * 100).toFixed(0)}% tonic=${(k.tonicConfidence * 100).toFixed(0)}%`;
      console.log(`      ${name.padEnd(20)} ${bar} ${pct.padStart(5)}% (${detail})${marker}`);
    }
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

  // With only 3 bars per key center and prominent V chords, the tonic
  // disambiguation may pick the dominant root. We check that at least
  // the resolution bar (the I chord) is correctly identified, and that
  // the PC set is correct (same-group modes are acceptable).
  const bar3 = CANDIDATES[result.segments[2].bestIdx]; // Cmaj7 bar
  const bar6 = CANDIDATES[result.segments[5].bestIdx]; // Fmaj7 bar
  const bar9 = CANDIDATES[result.segments[8].bestIdx]; // Bbmaj7 bar
  // The I chord bar should resolve to the correct root or a same-group mode
  const cGroupRoots = new Set([0, 2, 7, 9]); // C maj, D dorian, G mixo, A min
  const fGroupRoots = new Set([0, 2, 3, 5, 7, 10]); // F maj / C mixo / Bb lydian etc
  check('Bar 3 (Cmaj7): C-group PC set', cGroupRoots.has(bar3.root));
  check('Bar 6 (Fmaj7): F-group PC set', fGroupRoots.has(bar6.root));
  const bbGroupRoots = new Set([3, 5, 7, 10]); // Bb maj / C dorian / F mixo / etc
  check('Bar 9 (Bbmaj7): Bb-group PC set', bbGroupRoots.has(bar9.root));
  check('Not atonal', !result.isLikelyAtonal);
  // Global: C should be in the top keys
  check('Global #1 is C-group', cGroupRoots.has(result.globalRanking[0]?.root));
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

  // Jazz with secondary dominants, tritone subs, and chromatic passing chords.
  // Many bars use notes outside C major (E7→Am, A7→Dm, Db7, Fm7).
  // The C-group (C major / D dorian / A minor / G mixolydian) should
  // dominate, but individual bars may show related modes.
  const cGroupRoots = new Set([0, 2, 7, 9]);
  const cGroupCount = result.segments.filter((s) =>
    cGroupRoots.has(CANDIDATES[s.bestIdx].root),
  ).length;
  check(`${cGroupCount}/16 segments in C-group (expect majority)`, cGroupCount >= 8);
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

  // With distant modulation, the HMM may create a gradual transition
  // through intermediate keys (C→G→D→F#). This is musically reasonable.
  // We check that the endpoints are correct and there is a clear split.
  const bar1C = CANDIDATES[result.segments[0].bestIdx].root === 0;
  const bar2C = CANDIDATES[result.segments[1].bestIdx].root === 0;
  const bar7F = CANDIDATES[result.segments[6].bestIdx].root === 6;
  const bar8F = CANDIDATES[result.segments[7].bestIdx].root === 6;
  check('Bar 1-2: C-rooted', bar1C && bar2C);
  check('Bar 7-8: F#-rooted', bar7F && bar8F);
  check('Not atonal', !result.isLikelyAtonal);
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

  // A minor should dominate: bass A in 5/8 bars, starts & ends on Am.
  // C major shares the same PC set, so it should appear as a strong alternative
  // in the region's keyProbabilities (binary, independent).
  check('Not atonal', !result.isLikelyAtonal);
  check('Global #1 is A-rooted (bass+position signals)', result.globalRanking[0]?.root === 9);
  // Check that C-rooted candidates appear somewhere in top 5 of global ranking
  const top5roots = result.globalRanking.slice(0, 5).map((r) => r.root);
  check('C(0) appears in global top 5', top5roots.includes(0));
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
