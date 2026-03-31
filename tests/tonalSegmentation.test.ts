/**
 * Tonal Segmentation algorithm tests.
 *
 * Run: npx tsx tests/tonalSegmentation.test.ts
 */

import {
  analyzeTonalSegments,
  candidateName,
  collapseToRoots,
  CANDIDATES,
} from '../src/utils/tonalSegmentation';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const TPB = 480;
const BAR = TPB * 4;

// ─── Helpers ─────────────────────────────────────────────

type SimpleNote = { pitch: number; startTick: number; duration: number };

/** Create whole-note chord at a given bar. */
function chord(bar: number, pitches: number[], dur = BAR): SimpleNote[] {
  return pitches.map((pitch) => ({ pitch, startTick: bar * BAR, duration: dur }));
}

/** Find candidate index for a root + mode. */
function findCandidate(rootName: string, mode: string): number {
  const root = NOTE_NAMES.indexOf(rootName);
  return CANDIDATES.findIndex((c) => c.root === root && c.mode === mode);
}

/** Format segment results as a readable table. */
function printResults(label: string, result: ReturnType<typeof analyzeTonalSegments>) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${label}`);
  console.log('='.repeat(70));

  const { rootProbs, rootModes } = collapseToRoots(result.segments);

  // Find top keys across all segments for compact display
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
  const header = '  Bar  | ' + topRoots.map((r) => NOTE_NAMES[r].padStart(6)).join(' | ') + ' | Best';
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

  // Summary: find regions of same key
  console.log('\n  Regions:');
  let regionStart = 0;
  let regionKey = candidateName(result.segments[0].bestIdx);
  for (let i = 1; i <= result.segments.length; i++) {
    const key = i < result.segments.length ? candidateName(result.segments[i].bestIdx) : '';
    if (key !== regionKey) {
      const startBar = regionStart + 1;
      const endBar = i;
      console.log(`    Bar ${startBar}-${endBar}: ${regionKey}`);
      regionStart = i;
      regionKey = key;
    }
  }
}

// ─── Test 1: Pure C major ────────────────────────────────

function test1_pureCMajor() {
  const notes: SimpleNote[] = [
    ...chord(0, [48, 52, 55, 59]),  // Cmaj7
    ...chord(1, [50, 53, 57, 60]),  // Dm7
    ...chord(2, [52, 55, 59, 62]),  // Em7
    ...chord(3, [53, 57, 60, 64]),  // Fmaj7
    ...chord(4, [43, 47, 50, 53]),  // G7
    ...chord(5, [45, 48, 52, 55]),  // Am7
    ...chord(6, [47, 50, 53, 57]),  // Bm7b5 (technically diatonic)
    ...chord(7, [48, 52, 55, 59]),  // Cmaj7
  ];

  const result = analyzeTonalSegments(notes, TPB);
  printResults('Test 1: Pure C Major (I-ii-iii-IV-V-vi-vii-I)', result);

  // Verify all segments point to C major or close relative
  const cMajIdx = findCandidate('C', 'major');
  const allC = result.segments.every((s) => {
    const best = CANDIDATES[s.bestIdx];
    return best.root === 0; // C root (could be major or related mode)
  });
  console.log(`  [${allC ? 'PASS' : 'FAIL'}] All segments detected as C-rooted`);
}

// ─── Test 2: C major → G major modulation ────────────────

function test2_modulation_C_to_G() {
  const notes: SimpleNote[] = [
    // C major section (bars 0-3)
    ...chord(0, [48, 52, 55, 59]),  // Cmaj7
    ...chord(1, [50, 53, 57, 60]),  // Dm7
    ...chord(2, [43, 47, 50, 53]),  // G7
    ...chord(3, [48, 52, 55, 59]),  // Cmaj7
    // G major section (bars 4-7)
    ...chord(4, [43, 47, 50, 54]),  // Gmaj7
    ...chord(5, [45, 49, 52, 55]),  // Am7 (ii in G)
    ...chord(6, [50, 54, 57, 60]),  // D7 (V in G)
    ...chord(7, [43, 47, 50, 54]),  // Gmaj7
  ];

  const result = analyzeTonalSegments(notes, TPB);
  printResults('Test 2: C Major → G Major Modulation', result);

  const firstHalf = result.segments.slice(0, 4).every((s) => CANDIDATES[s.bestIdx].root === 0);
  const secondHalf = result.segments.slice(4).every((s) => CANDIDATES[s.bestIdx].root === 7);
  console.log(`  [${firstHalf ? 'PASS' : 'FAIL'}] Bars 1-4: C`);
  console.log(`  [${secondHalf ? 'PASS' : 'FAIL'}] Bars 5-8: G`);
}

// ─── Test 3: ii-V-I in multiple keys ────────────────────

function test3_iiVI_multipleKeys() {
  const notes: SimpleNote[] = [
    // ii-V-I in C (bars 0-2)
    ...chord(0, [50, 53, 57, 60]),  // Dm7
    ...chord(1, [43, 47, 50, 53]),  // G7
    ...chord(2, [48, 52, 55, 59]),  // Cmaj7
    // ii-V-I in F (bars 3-5)
    ...chord(3, [43, 48, 51, 55]),  // Gm7
    ...chord(4, [48, 52, 55, 58]),  // C7
    ...chord(5, [53, 57, 60, 64]),  // Fmaj7
    // ii-V-I in Bb (bars 6-8)
    ...chord(6, [48, 51, 55, 58]),  // Cm7
    ...chord(7, [41, 45, 48, 51]),  // F7
    ...chord(8, [46, 50, 53, 57]),  // Bbmaj7
  ];

  const result = analyzeTonalSegments(notes, TPB);
  printResults('Test 3: ii-V-I in C → F → Bb', result);

  const region1 = result.segments.slice(0, 3).every((s) => CANDIDATES[s.bestIdx].root === 0);
  const region2 = result.segments.slice(3, 6).every((s) => CANDIDATES[s.bestIdx].root === 5);
  const region3 = result.segments.slice(6, 9).every((s) => CANDIDATES[s.bestIdx].root === 10);
  console.log(`  [${region1 ? 'PASS' : 'FAIL'}] Bars 1-3: C`);
  console.log(`  [${region2 ? 'PASS' : 'FAIL'}] Bars 4-6: F`);
  console.log(`  [${region3 ? 'PASS' : 'FAIL'}] Bars 7-9: Bb`);
}

// ─── Test 4: Blues (modal ambiguity) ─────────────────────

function test4_blues() {
  // C blues: I7-IV7-I7-V7-IV7-I7
  // Uses b7 (Bb) throughout → mixolydian or blues feel
  const notes: SimpleNote[] = [
    ...chord(0, [48, 52, 55, 58]),  // C7
    ...chord(1, [48, 52, 55, 58]),  // C7
    ...chord(2, [48, 52, 55, 58]),  // C7
    ...chord(3, [48, 52, 55, 58]),  // C7
    ...chord(4, [53, 57, 60, 63]),  // F7 (has Ab)
    ...chord(5, [53, 57, 60, 63]),  // F7
    ...chord(6, [48, 52, 55, 58]),  // C7
    ...chord(7, [48, 52, 55, 58]),  // C7
    ...chord(8, [43, 47, 50, 53]),  // G7
    ...chord(9, [53, 57, 60, 63]),  // F7
    ...chord(10, [48, 52, 55, 58]), // C7
    ...chord(11, [48, 52, 55, 58]), // C7
  ];

  const result = analyzeTonalSegments(notes, TPB);
  printResults('Test 4: 12-Bar Blues in C', result);

  // Blues should mostly show C root (mixolydian or major)
  const cRooted = result.segments.filter((s) => CANDIDATES[s.bestIdx].root === 0).length;
  const ratio = cRooted / result.segments.length;
  console.log(`  [${ratio >= 0.5 ? 'PASS' : 'FAIL'}] ${cRooted}/${result.segments.length} segments C-rooted (expect majority)`);
}

// ─── Test 5: Chromatic / atonal ──────────────────────────

function test5_chromatic() {
  // All 12 notes equally, every bar
  const notes: SimpleNote[] = [];
  for (let bar = 0; bar < 4; bar++) {
    for (let pc = 0; pc < 12; pc++) {
      notes.push({ pitch: 48 + pc, startTick: bar * BAR, duration: BAR });
    }
  }

  const result = analyzeTonalSegments(notes, TPB);
  printResults('Test 5: Chromatic (all 12 notes equal)', result);

  // No key should have high confidence
  const maxProb = Math.max(...result.segments.flatMap((s) => s.probs));
  console.log(`  [${maxProb < 0.1 ? 'PASS' : 'WARN'}] Max confidence: ${(maxProb * 100).toFixed(1)}% (expect low, uniform)`);
}

// ─── Test 6: Jazz demo project ───────────────────────────

function test6_jazzDemo() {
  const notes: SimpleNote[] = [
    ...chord(0,  [48, 52, 55, 59]),  // Cmaj7
    ...chord(1,  [47, 50, 53, 57]),  // Bm7b5
    ...chord(2,  [52, 56, 59, 62]),  // E7 (has G#)
    ...chord(3,  [45, 48, 52, 55]),  // Am7
    ...chord(4,  [50, 53, 57, 60]),  // Dm7
    ...chord(5,  [43, 47, 50, 53]),  // G7
    ...chord(6,  [48, 52, 55, 59]),  // Cmaj7
    ...chord(7,  [48, 52, 55, 58]),  // C7 (has Bb → going to F)
    ...chord(8,  [53, 57, 60, 64]),  // Fmaj7
    ...chord(9,  [53, 56, 60, 63]),  // Fm7 (has Ab, Eb → modal interchange)
    ...chord(10, [52, 55, 59, 62]),  // Em7
    ...chord(11, [45, 49, 52, 55]),  // A7 (secondary dominant, has C#)
    ...chord(12, [50, 53, 57, 60]),  // Dm7
    ...chord(13, [49, 53, 56, 59]),  // Db7 (tritone sub, has Db, Ab)
    ...chord(14, [48, 52, 55, 59]),  // Cmaj7
    ...chord(15, [43, 47, 50, 53]),  // G7 (turnaround)
  ];

  const result = analyzeTonalSegments(notes, TPB);
  printResults('Test 6: Jazz Demo (16-bar with secondary dominants & tritone sub)', result);

  // Should be mostly C-rooted despite chromatic chords
  const cRooted = result.segments.filter((s) => CANDIDATES[s.bestIdx].root === 0).length;
  console.log(`  [${cRooted >= 10 ? 'PASS' : 'FAIL'}] ${cRooted}/16 segments C-rooted (expect majority for C major jazz)`);
}

// ─── Test 7: Distant modulation (C → F#) ────────────────

function test7_distantModulation() {
  const notes: SimpleNote[] = [
    // Firmly in C (bars 0-3)
    ...chord(0, [48, 52, 55]),      // C
    ...chord(1, [53, 57, 60]),      // F
    ...chord(2, [43, 47, 50]),      // G
    ...chord(3, [48, 52, 55]),      // C
    // Firmly in F# / Gb (bars 4-7) — maximally distant
    ...chord(4, [42, 46, 49]),      // F#
    ...chord(5, [47, 51, 54]),      // B
    ...chord(6, [37, 41, 44]),      // C# (= Db)
    ...chord(7, [42, 46, 49]),      // F#
  ];

  const result = analyzeTonalSegments(notes, TPB);
  printResults('Test 7: Distant Modulation C → F#', result);

  const firstHalf = result.segments.slice(0, 4).every((s) => CANDIDATES[s.bestIdx].root === 0);
  const secondHalf = result.segments.slice(4).every((s) => CANDIDATES[s.bestIdx].root === 6);
  console.log(`  [${firstHalf ? 'PASS' : 'FAIL'}] Bars 1-4: C`);
  console.log(`  [${secondHalf ? 'PASS' : 'FAIL'}] Bars 5-8: F#`);
}

// ─── Run all tests ───────────────────────────────────────

console.log('\nTonal Segmentation Algorithm Tests');
console.log('==================================\n');

test1_pureCMajor();
test2_modulation_C_to_G();
test3_iiVI_multipleKeys();
test4_blues();
test5_chromatic();
test6_jazzDemo();
test7_distantModulation();

console.log('\n' + '='.repeat(70));
console.log('  All tests complete.');
console.log('='.repeat(70));
