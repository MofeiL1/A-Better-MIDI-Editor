/**
 * Analyze classical piano MIDI files with chord boundary detection.
 * Run: npx tsx tests/analyzePiano.ts
 */

import { detectChordBoundaries } from '../src/utils/chordBoundary';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Midi } = require('@tonejs/midi');

const PC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
type SimpleNote = { pitch: number; startTick: number; duration: number };

const MIDI_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'midi-fixtures');

function analyze(file: string, title: string, showBars: number = 20) {
  const m = new Midi(fs.readFileSync(path.join(MIDI_DIR, file)));
  const ppq = m.header.ppq;
  const bar = ppq * 4;

  const notes: SimpleNote[] = [];
  for (const t of m.tracks) {
    for (const n of t.notes) {
      notes.push({ pitch: n.midi, startTick: Math.round(n.ticks), duration: Math.round(n.durationTicks) });
    }
  }

  const segs = detectChordBoundaries(notes, ppq);

  console.log('\n' + '='.repeat(70));
  console.log(title + ' | ' + file);
  console.log('PPQ:', ppq, '| Notes:', notes.length, '| Segments:', segs.length);
  console.log('-'.repeat(70));

  const maxTick = showBars * bar;
  for (const s of segs) {
    if (s.startTick >= maxTick) break;
    const startBar = (s.startTick / bar).toFixed(1);
    const endBar = (s.endTick / bar).toFixed(1);
    const pcsArr = [...s.pcs].sort((a, b) => a - b).map(p => PC[p]);
    const bass = PC[s.bassPc];
    console.log(`  Bar ${startBar.padStart(5)}-${endBar.padStart(5)} | Bass: ${bass.padEnd(3)}| PCs: ${pcsArr.join(',')}`);
  }
  console.log(`  ... (${segs.length} total segments)`);
}

// ─── Bach WTC Prelude in C (BWV 846) ─────────────────────
// Known harmony: C | Dm7/C | G7/B | C | Am7/C | D7/C | G/B | ...
// Each bar is one arpeggiated chord pattern
analyze('bach_prelude_c_846.mid', 'Bach WTC I Prelude in C (BWV 846)', 16);

// ─── Chopin Prelude No.4 in E minor ──────────────────────
// Known: Em | Em | Em | Em/D# | ... (slow chromatic descent in LH)
analyze('chopin_prelude_4.mid', 'Chopin Prelude Op.28 No.4 (E minor)', 16);

// ─── Chopin Prelude No.7 in A major ─────────────────────
// Known: A | E7/G# | A | E7 | A | D | A/E | E7 | A
// Very short (16 bars), mazurka rhythm
analyze('chopin_prelude_7.mid', 'Chopin Prelude Op.28 No.7 (A major)', 20);

// ─── Mozart K545 1st mvt ────────────────────────────────
// Known: C | C | G7 | G7 | ... (classic Alberti bass LH)
analyze('mozart_k545_1.mid', 'Mozart Sonata K545 1st mvt (C major)', 12);

// ─── Mozart K330 1st mvt ────────────────────────────────
// Known: C | C | ... | F | ... (sonata form in C major)
analyze('mozart_k330_1.mid', 'Mozart Sonata K330 1st mvt (C major)', 12);

// ─── Debussy Clair de Lune ──────────────────────────────
// Known: Db major, very fluid harmony
analyze('debussy_clair_de_lune.mid', 'Debussy Clair de Lune (Db major)', 12);

// ─── Schubert D960 2nd mvt ──────────────────────────────
// Known: C# minor, slow movement, clear harmonies
analyze('schubert_d960_2.mid', 'Schubert Sonata D960 2nd mvt (C# minor)', 12);

// ─── Beethoven Appassionata 2nd mvt ─────────────────────
// Known: Db major, theme and variations
analyze('beethoven_pathetique_2.mid', 'Beethoven Appassionata 2nd mvt (Db major)', 12);
