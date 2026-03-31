/**
 * Compare chord boundary detection against known harmonic analyses
 * of classical piano pieces.
 *
 * Run: npx tsx tests/pianoAnalysisCheck.ts
 */

import { detectChordBoundaries, type ChordSegment } from '../src/utils/chordBoundary';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Midi } = require('@tonejs/midi');

const PC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MIDI_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'midi-fixtures');

type SimpleNote = { pitch: number; startTick: number; duration: number };

function loadPianoNotes(file: string): { notes: SimpleNote[]; ppq: number } {
  const m = new Midi(fs.readFileSync(path.join(MIDI_DIR, file)));
  const notes: SimpleNote[] = [];
  for (const t of m.tracks) {
    for (const n of t.notes) {
      notes.push({ pitch: n.midi, startTick: Math.round(n.ticks), duration: Math.round(n.durationTicks) });
    }
  }
  return { notes, ppq: m.header.ppq };
}

function pcName(pc: number): string { return PC[((pc % 12) + 12) % 12]; }

// Expected chord per bar. Root is pitch class name.
type ExpectedChord = { bar: number; root: string; quality?: string; bass?: string };

function findSegAtBar(segs: ChordSegment[], bar: number, ppq: number): ChordSegment | null {
  const barTick = bar * ppq * 4;
  // Find segment containing the middle of this bar
  const mid = barTick + ppq * 2;
  return segs.find(s => s.startTick <= mid && s.endTick > mid) ?? null;
}

function checkPiece(
  file: string,
  title: string,
  expected: ExpectedChord[],
) {
  const { notes, ppq } = loadPianoNotes(file);
  const segs = detectChordBoundaries(notes, ppq);

  console.log('\n' + '='.repeat(70));
  console.log(title);
  console.log('-'.repeat(70));

  let correct = 0;
  let bassCorrect = 0;
  let rootInPcs = 0;
  const issues: string[] = [];

  for (const exp of expected) {
    const seg = findSegAtBar(segs, exp.bar, ppq);
    if (!seg) {
      issues.push(`Bar ${exp.bar}: no segment found`);
      continue;
    }

    const detBass = pcName(seg.bassPc);
    const expectedBass = exp.bass ?? exp.root;
    const expectedRoot = exp.root;
    const pcsStr = [...seg.pcs].sort((a, b) => a - b).map(p => PC[p]).join(',');

    // Check 1: does detected bass match expected bass?
    const bassMatch = detBass === expectedBass;
    if (bassMatch) bassCorrect++;

    // Check 2: is expected root present in detected PCs?
    const rootPc = PC.indexOf(expectedRoot);
    const rootFound = rootPc >= 0 && seg.pcs.has(rootPc);
    if (rootFound) rootInPcs++;

    // Check 3: both match
    if (bassMatch && rootFound) correct++;

    const status = bassMatch ? 'OK' : 'MISS';
    const line = `  Bar ${String(exp.bar).padStart(2)}: expect ${(expectedRoot + (exp.quality || '')).padEnd(8)} bass=${expectedBass.padEnd(3)}| ` +
      `det bass=${detBass.padEnd(3)} pcs=[${pcsStr}] ${status}`;
    console.log(line);
    if (!bassMatch) {
      issues.push(`Bar ${exp.bar}: bass ${detBass} != expected ${expectedBass}`);
    }
  }

  const total = expected.length;
  console.log('-'.repeat(70));
  console.log(`  Bass accuracy: ${bassCorrect}/${total} (${(bassCorrect / total * 100).toFixed(0)}%)`);
  console.log(`  Root in PCs:   ${rootInPcs}/${total} (${(rootInPcs / total * 100).toFixed(0)}%)`);
  if (issues.length > 0) {
    console.log(`  Issues (${issues.length}):`);
    for (const i of issues) console.log('    - ' + i);
  }

  return { total, bassCorrect, rootInPcs, issues };
}

// ═══════════════════════════════════════════════════════════
// Bach WTC I Prelude in C (BWV 846)
// One arpeggiated chord per bar, very clear harmony
// ═══════════════════════════════════════════════════════════

const bach846 = checkPiece('bach_prelude_c_846.mid', 'Bach WTC I - Prelude in C major (BWV 846)', [
  // Standard analysis: 1 chord per bar
  { bar: 0, root: 'C', quality: '', bass: 'C' },            // C
  { bar: 1, root: 'D', quality: 'm7', bass: 'C' },          // Dm7/C
  { bar: 2, root: 'G', quality: '7', bass: 'B' },           // G7/B
  { bar: 3, root: 'C', quality: '', bass: 'C' },            // C
  { bar: 4, root: 'A', quality: 'm', bass: 'C' },           // Am/C
  { bar: 5, root: 'D', quality: '7', bass: 'C' },           // D7/C
  { bar: 6, root: 'G', quality: '', bass: 'B' },            // G/B
  { bar: 7, root: 'C', quality: '', bass: 'C' },            // C
  { bar: 8, root: 'A', quality: 'm7', bass: 'A' },          // Am7 (some editions say Am7/C)
  { bar: 9, root: 'D', quality: '7', bass: 'D' },           // D7
  { bar: 10, root: 'G', quality: '', bass: 'G' },           // G
  { bar: 11, root: 'G', quality: 'dim7', bass: 'G' },       // Gdim7 (or Ab: Abdim7)
]);

// ═══════════════════════════════════════════════════════════
// Chopin Prelude Op.28 No.4 in E minor
// Chromatic descending inner voice, one chord per bar
// Note: this piece has very complex inner voice leading that
// makes bass detection challenging
// ═══════════════════════════════════════════════════════════

const chopin4 = checkPiece('chopin_prelude_4.mid', 'Chopin Prelude Op.28 No.4 (E minor)', [
  // The LH has sustained chords with chromatic descent
  // Bass notes are typically the lowest note of each voicing
  { bar: 1, root: 'E', quality: 'm', bass: 'E' },          // Em (but LH voicing may not have E as lowest)
  { bar: 2, root: 'E', quality: 'm', bass: 'E' },          // Em/D# (D# in inner voice)
  { bar: 3, root: 'E', quality: 'm7', bass: 'D' },         // Em7/D
  { bar: 4, root: 'A', quality: 'm', bass: 'C' },          // Am/C (or C#m7b5)
  { bar: 5, root: 'B', quality: '7', bass: 'B' },          // B7
  { bar: 6, root: 'E', quality: 'm', bass: 'E' },          // Em
  { bar: 7, root: 'E', quality: 'm7', bass: 'D' },         // Em7/D
  { bar: 8, root: 'C', quality: '', bass: 'C' },           // C
  { bar: 9, root: 'B', quality: '7', bass: 'B' },          // B7
  { bar: 10, root: 'E', quality: 'm', bass: 'B' },         // Em (or B)
]);

// ═══════════════════════════════════════════════════════════
// Chopin Prelude Op.28 No.7 in A major
// Simple mazurka, 16 bars total
// Mostly I-V alternation, brief IV section
// ═══════════════════════════════════════════════════════════

const chopin7 = checkPiece('chopin_prelude_7.mid', 'Chopin Prelude Op.28 No.7 (A major)', [
  { bar: 1, root: 'E', quality: '7', bass: 'E' },          // E7 (or A then E7)
  { bar: 2, root: 'A', quality: '', bass: 'A' },           // A
  { bar: 3, root: 'E', quality: '7', bass: 'E' },          // E7
  { bar: 4, root: 'A', quality: '', bass: 'A' },           // A
  { bar: 5, root: 'E', quality: '7', bass: 'E' },          // E7
  { bar: 6, root: 'A', quality: '', bass: 'A' },           // A
  { bar: 9, root: 'D', quality: '', bass: 'D' },           // D (IV)
  { bar: 10, root: 'A', quality: '', bass: 'E' },          // A/E or E7
  { bar: 11, root: 'A', quality: '', bass: 'A' },          // A
]);

// ═══════════════════════════════════════════════════════════
// Mozart K545 1st mvt (C major)
// Famous "easy" sonata with Alberti bass
// Very clear functional harmony
// ═══════════════════════════════════════════════════════════

const mozart545 = checkPiece('mozart_k545_1.mid', 'Mozart Sonata K545 1st mvt (C major)', [
  { bar: 0, root: 'C', quality: '', bass: 'C' },           // C
  { bar: 1, root: 'C', quality: '', bass: 'C' },           // C (some say G7/B in 2nd half)
  { bar: 2, root: 'C', quality: '', bass: 'C' },           // C
  { bar: 3, root: 'G', quality: '', bass: 'C' },           // G/B→C (mixed)
  { bar: 4, root: 'F', quality: '', bass: 'F' },           // F/A (→G in 2nd half)
  { bar: 5, root: 'F', quality: '', bass: 'F' },           // F (→G in 2nd half)
  { bar: 6, root: 'C', quality: '', bass: 'C' },           // C/E (→F)
  { bar: 7, root: 'C', quality: '', bass: 'C' },           // G7→C cadence
  { bar: 10, root: 'G', quality: '', bass: 'G' },          // G (transition to dominant)
]);

// ═══════════════════════════════════════════════════════════
// Debussy Clair de Lune (Db major)
// Impressionist harmony, fluid voicings
// ═══════════════════════════════════════════════════════════

const debussy = checkPiece('debussy_clair_de_lune.mid', 'Debussy Clair de Lune (Db major)', [
  // Opening: Db major arpeggiated figures
  { bar: 0, root: 'Db', quality: '', bass: 'Db' },         // Db (opening)
  { bar: 1, root: 'Bb', quality: 'm7', bass: 'Bb' },      // Bbm7
  { bar: 2, root: 'Eb', quality: 'm7', bass: 'Eb' },      // Ebm7
  { bar: 3, root: 'Ab', quality: '7', bass: 'Ab' },       // Ab7
  { bar: 4, root: 'Db', quality: '', bass: 'Db' },         // Db
  { bar: 9, root: 'Db', quality: '', bass: 'Db' },         // Db (return of theme)
]);

// ═══════════════════════════════════════════════════════════
// Beethoven Appassionata 2nd mvt (Db major)
// Theme and variations, clear chorale-like theme
// ═══════════════════════════════════════════════════════════

const beethoven = checkPiece('beethoven_pathetique_2.mid', 'Beethoven Appassionata 2nd mvt (Db major)', [
  // The theme opens with clear Db major harmony
  { bar: 0, root: 'Db', quality: '', bass: 'Db' },         // Db
  { bar: 1, root: 'Ab', quality: '7', bass: 'Ab' },       // Ab7 (dominant)
  { bar: 2, root: 'Db', quality: '', bass: 'Db' },         // Db
  { bar: 3, root: 'Ab', quality: '', bass: 'Ab' },         // Ab
  { bar: 4, root: 'Db', quality: '', bass: 'Db' },         // Db
]);

// ─── Summary ────────────────────────────────────────────

console.log('\n' + '='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));

const all = [
  { name: 'Bach BWV 846', ...bach846 },
  { name: 'Chopin Prelude 4', ...chopin4 },
  { name: 'Chopin Prelude 7', ...chopin7 },
  { name: 'Mozart K545', ...mozart545 },
  { name: 'Debussy CDL', ...debussy },
  { name: 'Beethoven Appass', ...beethoven },
];

let totalBass = 0, totalRoot = 0, totalN = 0;
for (const r of all) {
  console.log(`  ${r.name.padEnd(20)} | Bass: ${r.bassCorrect}/${r.total} (${(r.bassCorrect / r.total * 100).toFixed(0)}%) | Root in PCs: ${r.rootInPcs}/${r.total} (${(r.rootInPcs / r.total * 100).toFixed(0)}%) | Issues: ${r.issues.length}`);
  totalBass += r.bassCorrect;
  totalRoot += r.rootInPcs;
  totalN += r.total;
}
console.log('-'.repeat(70));
console.log(`  TOTAL                | Bass: ${totalBass}/${totalN} (${(totalBass / totalN * 100).toFixed(0)}%) | Root in PCs: ${totalRoot}/${totalN} (${(totalRoot / totalN * 100).toFixed(0)}%)`);
