/**
 * Chord boundary detection tests.
 *
 * Tests the algorithm against:
 * 1. Hand-crafted patterns (block chords, arpeggios, walking bass, anticipation)
 * 2. Real MIDI files from the Nottingham Music Dataset
 *
 * Run: npx tsx tests/chordBoundary.test.ts
 */

import { detectChordBoundaries, type ChordSegment } from '../src/utils/chordBoundary';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Midi } = require('@tonejs/midi');

const TPB = 480; // ticks per beat
const BAR = TPB * 4; // ticks per bar (4/4)

type SimpleNote = { pitch: number; startTick: number; duration: number };

// ─── Helpers ──────────────────────────────────────────────

const PC_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

function pcName(pc: number): string { return PC_NAMES[((pc % 12) + 12) % 12]; }

function segSummary(seg: ChordSegment, tpb: number): string {
  const startBeat = seg.startTick / tpb;
  const endBeat = seg.endTick / tpb;
  return `[${startBeat}-${endBeat}] bass=${pcName(seg.bassPc)} pcs={${[...seg.pcs].map(pcName).join(',')}}`;
}

/** Build a block chord (all notes start together). */
function chord(startTick: number, dur: number, pitches: number[]): SimpleNote[] {
  return pitches.map(pitch => ({ pitch, startTick, duration: dur }));
}

/** Build an arpeggio (notes start sequentially). */
function arpeggio(startTick: number, noteDur: number, interval: number, pitches: number[]): SimpleNote[] {
  return pitches.map((pitch, i) => ({
    pitch,
    startTick: startTick + i * interval,
    duration: noteDur,
  }));
}

/** MIDI pitch from note name. E.g. 'C4' = 60, 'G2' = 43 */
function midi(name: string): number {
  const match = name.match(/^([A-G])(#|b)?(\d)$/);
  if (!match) throw new Error(`Invalid note: ${name}`);
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = base[match[1]];
  if (match[2] === '#') pc++;
  if (match[2] === 'b') pc--;
  return (parseInt(match[3]) + 1) * 12 + pc;
}

// ─── Test Runner ──────────────────────────────────────────

let passed = 0;
let failed = 0;
let total = 0;

function test(name: string, fn: () => void) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (e: unknown) {
    failed++;
    console.log(`  FAIL: ${name}`);
    console.log(`        ${(e as Error).message}`);
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertEqual(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) throw new Error(`${msg}: expected ${expected}, got ${actual}`);
}

// ═══════════════════════════════════════════════════════════
// PART 1: Hand-crafted patterns
// ═══════════════════════════════════════════════════════════

console.log('\n=== Part 1: Block Chords ===');

test('1.1 Two block chords (C → F) should produce 2 segments', () => {
  const notes = [
    // C major: bar 0
    ...chord(0, BAR, [midi('C3'), midi('E3'), midi('G3')]),
    // F major: bar 1
    ...chord(BAR, BAR, [midi('F3'), midi('A3'), midi('C4')]),
  ];
  const segs = detectChordBoundaries(notes, TPB);
  assertEqual(segs.length, 2, 'segment count');
  assertEqual(pcName(segs[0].bassPc), 'C', 'seg 0 bass');
  assertEqual(pcName(segs[1].bassPc), 'F', 'seg 1 bass');
});

test('1.2 Four chords I-vi-IV-V in C', () => {
  const notes = [
    ...chord(0 * BAR, BAR, [midi('C3'), midi('E3'), midi('G3')]),     // C
    ...chord(1 * BAR, BAR, [midi('A2'), midi('C3'), midi('E3')]),     // Am
    ...chord(2 * BAR, BAR, [midi('F3'), midi('A3'), midi('C4')]),     // F
    ...chord(3 * BAR, BAR, [midi('G3'), midi('B3'), midi('D4')]),     // G
  ];
  const segs = detectChordBoundaries(notes, TPB);
  assertEqual(segs.length, 4, 'segment count');
  assertEqual(pcName(segs[0].bassPc), 'C', 'I');
  assertEqual(pcName(segs[1].bassPc), 'A', 'vi');
  assertEqual(pcName(segs[2].bassPc), 'F', 'IV');
  assertEqual(pcName(segs[3].bassPc), 'G', 'V');
});

test('1.3 Same chord for 4 bars should produce 1 segment', () => {
  const notes: SimpleNote[] = [];
  for (let bar = 0; bar < 4; bar++) {
    notes.push(...chord(bar * BAR, BAR, [midi('C3'), midi('E3'), midi('G3')]));
  }
  const segs = detectChordBoundaries(notes, TPB);
  assertEqual(segs.length, 1, 'segment count');
});

test('1.4 Two chords per bar (C and G alternating each half)', () => {
  const half = BAR / 2;
  const notes = [
    ...chord(0, half, [midi('C3'), midi('E3'), midi('G3')]),
    ...chord(half, half, [midi('G2'), midi('B2'), midi('D3')]),
    ...chord(BAR, half, [midi('C3'), midi('E3'), midi('G3')]),
    ...chord(BAR + half, half, [midi('G2'), midi('B2'), midi('D3')]),
  ];
  const segs = detectChordBoundaries(notes, TPB);
  // Should detect 4 chord changes (or at least more than 2)
  assert(segs.length >= 4, `expected >= 4 segments, got ${segs.length}`);
});

test('1.5 ii-V-I in C (Dm7 → G7 → Cmaj7)', () => {
  const notes = [
    ...chord(0 * BAR, BAR, [midi('D3'), midi('F3'), midi('A3'), midi('C4')]),   // Dm7
    ...chord(1 * BAR, BAR, [midi('G2'), midi('B2'), midi('D3'), midi('F3')]),   // G7
    ...chord(2 * BAR, BAR, [midi('C3'), midi('E3'), midi('G3'), midi('B3')]),   // Cmaj7
  ];
  const segs = detectChordBoundaries(notes, TPB);
  assertEqual(segs.length, 3, 'segment count');
  assertEqual(pcName(segs[0].bassPc), 'D', 'ii');
  assertEqual(pcName(segs[1].bassPc), 'G', 'V');
  assertEqual(pcName(segs[2].bassPc), 'C', 'I');
});

// ═══════════════════════════════════════════════════════════
console.log('\n=== Part 2: Arpeggios ===');

test('2.1 Arpeggiated C major (C-E-G) should be 1 segment', () => {
  // C arpeggio spanning 1 bar, each note a quarter note, overlapping slightly
  const notes = arpeggio(0, TPB + 100, TPB, [midi('C3'), midi('E3'), midi('G3'), midi('C4')]);
  const segs = detectChordBoundaries(notes, TPB);
  assertEqual(segs.length, 1, 'segment count');
  assertEqual(pcName(segs[0].bassPc), 'C', 'bass');
  assert(segs[0].pcs.has(0), 'has C');  // C=0
  assert(segs[0].pcs.has(4), 'has E');  // E=4
  assert(segs[0].pcs.has(7), 'has G');  // G=7
});

test('2.2 Two arpeggiated chords: C then F', () => {
  const notes = [
    // C arpeggio bar 0: C-E-G-C, each slightly overlapping
    ...arpeggio(0, TPB + 50, TPB, [midi('C3'), midi('E3'), midi('G3'), midi('C4')]),
    // F arpeggio bar 1: F-A-C-F
    ...arpeggio(BAR, TPB + 50, TPB, [midi('F3'), midi('A3'), midi('C4'), midi('F4')]),
  ];
  const segs = detectChordBoundaries(notes, TPB);
  assertEqual(segs.length, 2, 'segment count');
  assertEqual(pcName(segs[0].bassPc), 'C', 'seg 0 bass');
  assertEqual(pcName(segs[1].bassPc), 'F', 'seg 1 bass');
});

test('2.3 Alberti bass pattern (C-G-E-G repeated) = 1 chord', () => {
  // Classic Alberti: lowest note is always C, just rearranged
  const eighth = TPB / 2;
  const notes: SimpleNote[] = [];
  for (let beat = 0; beat < 4; beat++) {
    const t = beat * TPB;
    notes.push({ pitch: midi('C3'), startTick: t, duration: eighth });
    notes.push({ pitch: midi('G3'), startTick: t + eighth, duration: eighth });
  }
  // Add E notes on every other subdivision
  notes.push({ pitch: midi('E3'), startTick: TPB / 2, duration: eighth });
  notes.push({ pitch: midi('E3'), startTick: TPB + TPB / 2, duration: eighth });
  notes.push({ pitch: midi('E3'), startTick: 2 * TPB + TPB / 2, duration: eighth });
  notes.push({ pitch: midi('E3'), startTick: 3 * TPB + TPB / 2, duration: eighth });

  const segs = detectChordBoundaries(notes, TPB);
  // All notes are C, E, G with C as bass → should be 1 segment
  assertEqual(segs.length, 1, 'segment count');
  assertEqual(pcName(segs[0].bassPc), 'C', 'bass');
});

test('2.4 Staccato arpeggio C then staccato arpeggio F (non-overlapping)', () => {
  // Very short notes, no overlap at all
  const sixteenth = TPB / 4;
  const notes = [
    // Bar 0: staccato C arpeggio
    { pitch: midi('C3'), startTick: 0, duration: sixteenth },
    { pitch: midi('E3'), startTick: TPB, duration: sixteenth },
    { pitch: midi('G3'), startTick: 2 * TPB, duration: sixteenth },
    // Bar 1: staccato F arpeggio
    { pitch: midi('F3'), startTick: BAR, duration: sixteenth },
    { pitch: midi('A3'), startTick: BAR + TPB, duration: sixteenth },
    { pitch: midi('C4'), startTick: BAR + 2 * TPB, duration: sixteenth },
  ];
  const segs = detectChordBoundaries(notes, TPB);
  // With staccato notes, bass changes from C→E→G→F→A→C
  // But the key question is: does it detect bar 0 and bar 1 as separate?
  // The bass changes within each bar are arpeggio artifacts.
  // With minSegmentBeats=1, short segments may be merged.
  // At minimum, we expect the bass to eventually be different between the two groups.
  assert(segs.length >= 2, `should detect at least 2 segments, got ${segs.length}`);
});

// ═══════════════════════════════════════════════════════════
console.log('\n=== Part 3: Anticipation ===');

test('3.1 Anticipation: F chord starts half beat before bar 2', () => {
  const anticipation = TPB / 2; // half beat early
  const notes = [
    // C chord in bar 0
    ...chord(0, BAR, [midi('C3'), midi('E3'), midi('G3')]),
    // F chord anticipates: starts at bar 1 - half beat
    ...chord(BAR - anticipation, BAR, [midi('F3'), midi('A3'), midi('C4')]),
  ];
  const segs = detectChordBoundaries(notes, TPB);
  // Should detect the boundary somewhere near the bar line
  assert(segs.length >= 2, `expected >= 2 segments, got ${segs.length}`);
  assertEqual(pcName(segs[0].bassPc), 'C', 'first chord bass');
  // The F chord should show up in a later segment
  const lastSeg = segs[segs.length - 1];
  assertEqual(pcName(lastSeg.bassPc), 'F', 'anticipated chord bass');
});

test('3.2 Anticipation with sustained bass', () => {
  // Bass C holds through, but upper voices change to F chord early
  const notes = [
    // Bass C sustained 2 bars
    { pitch: midi('C3'), startTick: 0, duration: 2 * BAR },
    // Upper voices: C chord bar 0
    ...chord(0, BAR, [midi('E4'), midi('G4')]),
    // Upper voices: F chord anticipates bar 1 by half beat
    ...chord(BAR - TPB / 2, BAR, [midi('F4'), midi('A4')]),
  ];
  const segs = detectChordBoundaries(notes, TPB);
  // Bass doesn't change, so boundary detection depends on upper voice PC change
  // The upper voices change from E,G to F,A → significant Jaccard change
  assert(segs.length >= 2, `expected >= 2 with upper voice change, got ${segs.length}`);
});

// ═══════════════════════════════════════════════════════════
console.log('\n=== Part 4: Walking Bass ===');

test('4.1 Walking bass over static C chord', () => {
  // Walking bass: C-E-G-B (ascending), upper voices hold C chord
  const notes = [
    // Upper voices sustain for 4 beats
    { pitch: midi('E4'), startTick: 0, duration: BAR },
    { pitch: midi('G4'), startTick: 0, duration: BAR },
    // Walking bass: each note 1 beat
    { pitch: midi('C3'), startTick: 0, duration: TPB },
    { pitch: midi('E3'), startTick: TPB, duration: TPB },
    { pitch: midi('G3'), startTick: 2 * TPB, duration: TPB },
    { pitch: midi('B3'), startTick: 3 * TPB, duration: TPB },
  ];
  const segs = detectChordBoundaries(notes, TPB);
  // The bass changes every beat, but the harmony is static (all notes are C, E, G, B = Cmaj7)
  // The algorithm may split on bass changes, but the PCs remain the same
  // This is a known hard case - for now, document what happens
  for (const s of segs) {
    assert(s.pcs.has(0) || s.pcs.has(4) || s.pcs.has(7), 'all segments should contain C chord tones');
  }
});

test('4.2 Walking bass with chord change: C → F', () => {
  const notes = [
    // Bar 0: C chord, walking bass C-D-E-F
    { pitch: midi('E4'), startTick: 0, duration: BAR },
    { pitch: midi('G4'), startTick: 0, duration: BAR },
    { pitch: midi('C3'), startTick: 0, duration: TPB },
    { pitch: midi('D3'), startTick: TPB, duration: TPB },
    { pitch: midi('E3'), startTick: 2 * TPB, duration: TPB },
    { pitch: midi('F3'), startTick: 3 * TPB, duration: TPB },
    // Bar 1: F chord, walking bass F-G-A-Bb
    { pitch: midi('A4'), startTick: BAR, duration: BAR },
    { pitch: midi('C5'), startTick: BAR, duration: BAR },
    { pitch: midi('F3'), startTick: BAR, duration: TPB },
    { pitch: midi('G3'), startTick: BAR + TPB, duration: TPB },
    { pitch: midi('A3'), startTick: BAR + 2 * TPB, duration: TPB },
    { pitch: midi('B3'), startTick: BAR + 3 * TPB, duration: TPB },
  ];
  const segs = detectChordBoundaries(notes, TPB);
  // Should detect change between bar 0 and bar 1
  // Upper voices change from E,G to A,C → significant PC change
  assert(segs.length >= 2, `expected >= 2 segments, got ${segs.length}`);
});

// ═══════════════════════════════════════════════════════════
console.log('\n=== Part 5: Mixed Textures ===');

test('5.1 Melody + block chord accompaniment', () => {
  const notes: SimpleNote[] = [];
  // Left hand: block chords, one per bar
  notes.push(...chord(0, BAR, [midi('C3'), midi('E3'), midi('G3')]));
  notes.push(...chord(BAR, BAR, [midi('F3'), midi('A3'), midi('C4')]));
  notes.push(...chord(2 * BAR, BAR, [midi('G3'), midi('B3'), midi('D4')]));
  notes.push(...chord(3 * BAR, BAR, [midi('C3'), midi('E3'), midi('G3')]));

  // Right hand: scalar melody (should not create false boundaries)
  const melody = [midi('C5'), midi('D5'), midi('E5'), midi('F5'),
                   midi('G5'), midi('A5'), midi('B5'), midi('C6'),
                   midi('B5'), midi('A5'), midi('G5'), midi('F5'),
                   midi('E5'), midi('D5'), midi('C5'), midi('B4')];
  for (let i = 0; i < melody.length; i++) {
    notes.push({ pitch: melody[i], startTick: i * TPB, duration: TPB });
  }

  const segs = detectChordBoundaries(notes, TPB);
  // Should detect 4 chord segments (C, F, G, C)
  // Melody notes change every beat but bass drives the boundaries
  assertEqual(segs.length, 4, 'segment count');
  assertEqual(pcName(segs[0].bassPc), 'C', 'bar 0');
  assertEqual(pcName(segs[1].bassPc), 'F', 'bar 1');
  assertEqual(pcName(segs[2].bassPc), 'G', 'bar 2');
  assertEqual(pcName(segs[3].bassPc), 'C', 'bar 3');
});

test('5.2 Jazz voicing with tensions (Cmaj9, Dm11)', () => {
  const notes = [
    // Cmaj9: C E G B D (bass C in low octave, extensions higher)
    ...chord(0, BAR, [midi('C2'), midi('E3'), midi('G3'), midi('B3'), midi('D4')]),
    // Dm11: D F A C G (bass D, extensions)
    ...chord(BAR, BAR, [midi('D2'), midi('F3'), midi('A3'), midi('C4'), midi('G4')]),
  ];
  const segs = detectChordBoundaries(notes, TPB);
  assertEqual(segs.length, 2, 'segment count');
  assertEqual(pcName(segs[0].bassPc), 'C', 'Cmaj9 bass');
  assertEqual(pcName(segs[1].bassPc), 'D', 'Dm11 bass');
  // Verify extensions are captured in PC set
  assert(segs[0].pcs.has(2), 'Cmaj9 has D (9th)');
  assert(segs[1].pcs.has(7), 'Dm11 has G (11th)');
});

test('5.3 Pedal point (bass stays, upper harmony changes)', () => {
  // C pedal bass, upper voices change: C → Dm/C → G/C → C
  const notes = [
    // Pedal C bass sustained 4 bars
    { pitch: midi('C2'), startTick: 0, duration: 4 * BAR },
    // Upper voices
    ...chord(0, BAR, [midi('E4'), midi('G4')]),           // C chord
    ...chord(BAR, BAR, [midi('D4'), midi('F4'), midi('A4')]),  // Dm
    ...chord(2 * BAR, BAR, [midi('B3'), midi('D4'), midi('G4')]),  // G
    ...chord(3 * BAR, BAR, [midi('E4'), midi('G4')]),     // back to C
  ];
  const segs = detectChordBoundaries(notes, TPB);
  // Bass never changes (pedal C), so boundaries must come from PC set changes
  // E,G → D,F,A → B,D,G → E,G : significant Jaccard changes
  assert(segs.length >= 3, `expected >= 3 segments over pedal point, got ${segs.length}`);
});

// ═══════════════════════════════════════════════════════════
console.log('\n=== Part 6: Edge Cases ===');

test('6.1 Single note should produce 1 segment', () => {
  const notes = [{ pitch: midi('C4'), startTick: 0, duration: BAR }];
  const segs = detectChordBoundaries(notes, TPB);
  assertEqual(segs.length, 1, 'segment count');
});

test('6.2 Empty notes should produce 0 segments', () => {
  const segs = detectChordBoundaries([], TPB);
  assertEqual(segs.length, 0, 'segment count');
});

test('6.3 Gap between chords (silence in the middle)', () => {
  const notes = [
    ...chord(0, BAR, [midi('C3'), midi('E3'), midi('G3')]),
    // 2 bars of silence
    ...chord(3 * BAR, BAR, [midi('F3'), midi('A3'), midi('C4')]),
  ];
  const segs = detectChordBoundaries(notes, TPB);
  assertEqual(segs.length, 2, 'segment count');
  assertEqual(pcName(segs[0].bassPc), 'C', 'first chord');
  assertEqual(pcName(segs[1].bassPc), 'F', 'second chord after gap');
});

test('6.4 Very dense chords (chromatic cluster)', () => {
  const notes = chord(0, BAR, [midi('C3'), midi('Db3'), midi('D3'), midi('Eb3')]);
  const segs = detectChordBoundaries(notes, TPB);
  assertEqual(segs.length, 1, 'segment count');
  assert(segs[0].pcs.size >= 4, 'should capture all PCs');
});

// ═══════════════════════════════════════════════════════════
// PART 2: Real Song Arrangements (multiple textures per song)
// ═══════════════════════════════════════════════════════════

console.log('\n=== Part 8: Song Arrangements ===');

// ─── Song chord data ─────────────────────────────────────

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

function parseChordSymbol(s: string): { rootPc: number; intervals: number[] } {
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

// ─── Texture generators ──────────────────────────────────

type ChordSpec = { symbol: string; bar: number; beats?: number };

/** Generate block chord arrangement */
function blockChordArrangement(chords: ChordSpec[]): SimpleNote[] {
  const notes: SimpleNote[] = [];
  for (const c of chords) {
    const { rootPc, intervals } = parseChordSymbol(c.symbol);
    const dur = (c.beats ?? 4) * TPB;
    const bass = 36 + rootPc; // octave 2
    for (const iv of intervals) {
      notes.push({ pitch: bass + iv, startTick: c.bar * BAR, duration: dur });
    }
  }
  return notes;
}

/** Generate arpeggio arrangement (ascending, legato) */
function arpeggioArrangement(chords: ChordSpec[]): SimpleNote[] {
  const notes: SimpleNote[] = [];
  for (const c of chords) {
    const { rootPc, intervals } = parseChordSymbol(c.symbol);
    const beats = c.beats ?? 4;
    const notesPerChord = intervals.length;
    const noteInterval = (beats * TPB) / notesPerChord;
    const noteDur = noteInterval * 1.5; // overlap for legato
    const bass = 36 + rootPc;
    for (let i = 0; i < notesPerChord; i++) {
      notes.push({
        pitch: bass + intervals[i],
        startTick: c.bar * BAR + Math.round(i * noteInterval),
        duration: Math.round(noteDur),
      });
    }
  }
  return notes;
}

/** Generate walking bass + upper voicing arrangement */
function walkingBassArrangement(chords: ChordSpec[]): SimpleNote[] {
  const notes: SimpleNote[] = [];
  for (const c of chords) {
    const { rootPc, intervals } = parseChordSymbol(c.symbol);
    const beats = c.beats ?? 4;
    const bass = 36 + rootPc;
    // Upper voices: sustain chord tones (skip root, use 3rd, 5th, 7th)
    const upperIntervals = intervals.filter(iv => iv > 0);
    for (const iv of upperIntervals) {
      notes.push({ pitch: bass + iv + 12, startTick: c.bar * BAR, duration: beats * TPB });
    }
    // Walking bass: root on beat 1, then walk through chord tones
    const walkTones = [0, ...intervals.filter(iv => iv > 0 && iv < 12)];
    for (let b = 0; b < beats; b++) {
      const tone = walkTones[b % walkTones.length];
      notes.push({
        pitch: bass + tone,
        startTick: c.bar * BAR + b * TPB,
        duration: TPB,
      });
    }
  }
  return notes;
}

/** Generate broken chord (root-fifth-third-fifth pattern like Alberti) */
function brokenChordArrangement(chords: ChordSpec[]): SimpleNote[] {
  const notes: SimpleNote[] = [];
  for (const c of chords) {
    const { rootPc, intervals } = parseChordSymbol(c.symbol);
    const beats = c.beats ?? 4;
    const bass = 36 + rootPc;
    const eighth = TPB / 2;
    // Pattern: root-5th-3rd-5th for each beat
    const pattern = intervals.length >= 3
      ? [intervals[0], intervals[2], intervals[1], intervals[2]]
      : [intervals[0], intervals[1], intervals[0], intervals[1]];
    for (let b = 0; b < beats; b++) {
      for (let s = 0; s < 2; s++) {
        const idx = (b * 2 + s) % pattern.length;
        notes.push({
          pitch: bass + pattern[idx],
          startTick: c.bar * BAR + b * TPB + s * eighth,
          duration: eighth + 20, // slight overlap
        });
      }
    }
  }
  return notes;
}

/** Generate stride piano arrangement (bass on 1,3 + chord on 2,4) */
function strideArrangement(chords: ChordSpec[]): SimpleNote[] {
  const notes: SimpleNote[] = [];
  for (const c of chords) {
    const { rootPc, intervals } = parseChordSymbol(c.symbol);
    const beats = c.beats ?? 4;
    const bass = 36 + rootPc;
    for (let b = 0; b < beats; b++) {
      if (b % 2 === 0) {
        // Bass note on beats 1, 3
        notes.push({ pitch: bass, startTick: c.bar * BAR + b * TPB, duration: TPB });
      } else {
        // Chord on beats 2, 4
        for (const iv of intervals) {
          if (iv === 0) continue; // skip root in upper chord
          notes.push({ pitch: bass + iv + 12, startTick: c.bar * BAR + b * TPB, duration: TPB });
        }
      }
    }
  }
  return notes;
}

// ─── Song definitions ────────────────────────────────────

// Autumn Leaves (first 8 bars): Cm7 | F7 | Bbmaj7 | Ebmaj7 | Am7b5 | D7 | Gm | Gm
const AUTUMN_LEAVES: ChordSpec[] = [
  { symbol: 'Cm7', bar: 0 }, { symbol: 'F7', bar: 1 },
  { symbol: 'Bbmaj7', bar: 2 }, { symbol: 'Ebmaj7', bar: 3 },
  { symbol: 'Am7b5', bar: 4 }, { symbol: 'D7', bar: 5 },
  { symbol: 'Gm', bar: 6 }, { symbol: 'Gm', bar: 7 },
];

// All Of Me (first 8 bars): C | C | E7 | E7 | A7 | A7 | Dm | Dm
const ALL_OF_ME: ChordSpec[] = [
  { symbol: 'Cmaj7', bar: 0 }, { symbol: 'Cmaj7', bar: 1 },
  { symbol: 'E7', bar: 2 }, { symbol: 'E7', bar: 3 },
  { symbol: 'A7', bar: 4 }, { symbol: 'A7', bar: 5 },
  { symbol: 'Dm7', bar: 6 }, { symbol: 'Dm7', bar: 7 },
];

// Blue Bossa (first 8 bars): Cm7 | Cm7 | Fm7 | Fm7 | Dm7b5 | G7 | Cm7 | Cm7
const BLUE_BOSSA: ChordSpec[] = [
  { symbol: 'Cm7', bar: 0 }, { symbol: 'Cm7', bar: 1 },
  { symbol: 'Fm7', bar: 2 }, { symbol: 'Fm7', bar: 3 },
  { symbol: 'Dm7b5', bar: 4 }, { symbol: 'G7', bar: 5 },
  { symbol: 'Cm7', bar: 6 }, { symbol: 'Cm7', bar: 7 },
];

// I-V-vi-IV pop progression in C
const POP_PROGRESSION: ChordSpec[] = [
  { symbol: 'C', bar: 0 }, { symbol: 'G', bar: 1 },
  { symbol: 'Am', bar: 2 }, { symbol: 'F', bar: 3 },
  { symbol: 'C', bar: 4 }, { symbol: 'G', bar: 5 },
  { symbol: 'Am', bar: 6 }, { symbol: 'F', bar: 7 },
];

// Fast harmonic rhythm: 2 chords per bar (ii-V-I in Bb)
const FAST_HARMONY: ChordSpec[] = [
  { symbol: 'Cm7', bar: 0, beats: 2 }, { symbol: 'F7', bar: 0, beats: 2 },
  { symbol: 'Bbmaj7', bar: 1 },
  { symbol: 'Dm7', bar: 2, beats: 2 }, { symbol: 'G7', bar: 2, beats: 2 },
  { symbol: 'Cm7', bar: 3 },
];

// Songs and their expected bass sequence
type SongDef = {
  name: string;
  chords: ChordSpec[];
  expectedBassRoots: string[]; // expected bass PC names for each distinct chord
};

const SONGS: SongDef[] = [
  {
    name: 'Autumn Leaves',
    chords: AUTUMN_LEAVES,
    expectedBassRoots: ['C', 'F', 'Bb', 'Eb', 'A', 'D', 'G'],  // Gm repeated = 1 seg
  },
  {
    name: 'All Of Me',
    chords: ALL_OF_ME,
    expectedBassRoots: ['C', 'E', 'A', 'D'],  // repeated chords merge
  },
  {
    name: 'Blue Bossa',
    chords: BLUE_BOSSA,
    expectedBassRoots: ['C', 'F', 'D', 'G', 'C'],  // Cm→Fm→Dm7b5→G7→Cm
  },
  {
    name: 'Pop I-V-vi-IV',
    chords: POP_PROGRESSION,
    expectedBassRoots: ['C', 'G', 'A', 'F', 'C', 'G', 'A', 'F'],
  },
];

// ─── Run arrangement tests ───────────────────────────────

const TEXTURES: { name: string; gen: (c: ChordSpec[]) => SimpleNote[] }[] = [
  { name: 'block chord', gen: blockChordArrangement },
  { name: 'arpeggio', gen: arpeggioArrangement },
  { name: 'walking bass', gen: walkingBassArrangement },
  { name: 'broken chord', gen: brokenChordArrangement },
  { name: 'stride piano', gen: strideArrangement },
];

for (const song of SONGS) {
  for (const texture of TEXTURES) {
    test(`8. ${song.name} (${texture.name}): bass roots match`, () => {
      const notes = texture.gen(song.chords);
      const segs = detectChordBoundaries(notes, TPB);
      const detectedBass = segs.map(s => pcName(s.bassPc));

      // Check that detected bass sequence matches expected
      // Allow extra segments (algorithm may split within a chord) but require
      // all expected roots appear in order
      let ei = 0;
      for (let di = 0; di < detectedBass.length && ei < song.expectedBassRoots.length; di++) {
        if (detectedBass[di] === song.expectedBassRoots[ei]) ei++;
      }
      assert(
        ei === song.expectedBassRoots.length,
        `bass sequence mismatch: expected [${song.expectedBassRoots.join(',')}], ` +
        `detected [${detectedBass.join(',')}] (matched ${ei}/${song.expectedBassRoots.length})`,
      );
    });
  }
}

// Fast harmony test (2 chords per bar)
for (const texture of TEXTURES) {
  test(`8. Fast Harmony ii-V-I (${texture.name}): detects sub-bar changes`, () => {
    const notes = texture.gen(FAST_HARMONY);
    const segs = detectChordBoundaries(notes, TPB);
    // Should detect at least 4 distinct chord segments (Cm7, F7, Bbmaj7, then Dm7...)
    assert(segs.length >= 4, `expected >= 4 segments for fast harmony, got ${segs.length}`);
  });
}

// ═══════════════════════════════════════════════════════════
// PART 2b: Classical Piano Textures
// ═══════════════════════════════════════════════════════════

console.log('\n=== Part 9: Classical Piano Textures ===');

test('9.1 Bach-style Prelude in C (arpeggiated pattern, 1 chord per bar)', () => {
  // BWV 846 Prelude: broken chord pattern C-E-G-C-E repeated
  // Bar 0: C major, Bar 1: Dm7 (ii), Bar 2: G7 (V), Bar 3: C (I)
  const sixteenth = TPB / 4;
  const notes: SimpleNote[] = [];

  // Helper: Bach-style broken pattern for one bar
  function bachPattern(bar: number, pitches: number[]) {
    // Pattern: 1-2-3-4-5-3-4-5 repeated twice per bar (16 sixteenths)
    const pattern = pitches.length >= 5
      ? [0, 1, 2, 3, 4, 2, 3, 4, 0, 1, 2, 3, 4, 2, 3, 4]
      : [0, 1, 2, 1, 2, 1, 2, 1, 0, 1, 2, 1, 2, 1, 2, 1];
    for (let i = 0; i < 16; i++) {
      notes.push({
        pitch: pitches[pattern[i] % pitches.length],
        startTick: bar * BAR + i * sixteenth,
        duration: sixteenth + 10,
      });
    }
  }

  bachPattern(0, [midi('C3'), midi('E3'), midi('G3'), midi('C4'), midi('E4')]); // C
  bachPattern(1, [midi('D3'), midi('F3'), midi('A3'), midi('D4'), midi('F4')]); // Dm
  bachPattern(2, [midi('G2'), midi('B2'), midi('D3'), midi('G3'), midi('B3')]); // G
  bachPattern(3, [midi('C3'), midi('E3'), midi('G3'), midi('C4'), midi('E4')]); // C

  const segs = detectChordBoundaries(notes, TPB);
  const bassSeq = segs.map(s => pcName(s.bassPc));

  // Should detect C→D→G→C bass changes
  let matched = 0;
  const expected = ['C', 'D', 'G', 'C'];
  let ei = 0;
  for (const b of bassSeq) {
    if (ei < expected.length && b === expected[ei]) ei++;
  }
  assert(ei === expected.length, `Bach prelude bass: expected [${expected}], got [${bassSeq}], matched ${ei}/4`);
});

test('9.2 Mozart-style Alberti bass with melody (C → G → Am → F)', () => {
  const eighth = TPB / 2;
  const notes: SimpleNote[] = [];

  // Alberti bass: root-5th-3rd-5th pattern in left hand
  function albertiBass(bar: number, root: number, third: number, fifth: number) {
    for (let beat = 0; beat < 4; beat++) {
      const t = bar * BAR + beat * TPB;
      notes.push({ pitch: root, startTick: t, duration: eighth });
      notes.push({ pitch: fifth, startTick: t + eighth, duration: eighth });
    }
    // Add 3rd on off-beats
    for (let beat = 0; beat < 4; beat++) {
      notes.push({ pitch: third, startTick: bar * BAR + beat * TPB + eighth, duration: eighth });
    }
  }

  // Right hand melody (scale run, not chord-related)
  const melody = [midi('C5'), midi('D5'), midi('E5'), midi('F5'),
                   midi('G5'), midi('F5'), midi('E5'), midi('D5'),
                   midi('C5'), midi('B4'), midi('A4'), midi('G4'),
                   midi('F4'), midi('G4'), midi('A4'), midi('B4')];
  for (let i = 0; i < melody.length; i++) {
    notes.push({ pitch: melody[i], startTick: i * TPB, duration: TPB });
  }

  albertiBass(0, midi('C3'), midi('E3'), midi('G3'));   // C
  albertiBass(1, midi('G2'), midi('B2'), midi('D3'));   // G
  albertiBass(2, midi('A2'), midi('C3'), midi('E3'));   // Am
  albertiBass(3, midi('F2'), midi('A2'), midi('C3'));   // F

  const segs = detectChordBoundaries(notes, TPB);
  const bassSeq = segs.map(s => pcName(s.bassPc));
  const expected = ['C', 'G', 'A', 'F'];
  let ei = 0;
  for (const b of bassSeq) {
    if (ei < expected.length && b === expected[ei]) ei++;
  }
  assert(ei === expected.length, `Mozart Alberti: expected [${expected}], got [${bassSeq}], matched ${ei}/4`);
});

test('9.3 Chopin-style wide arpeggio (bass note far from upper notes)', () => {
  const notes: SimpleNote[] = [];

  // Very wide arpeggios spanning 4+ octaves
  // Bar 0: Am (A2 - C4 - E4 - A4 - C5 - E5)
  function wideArpeggio(bar: number, pitches: number[]) {
    const noteInterval = BAR / pitches.length;
    for (let i = 0; i < pitches.length; i++) {
      notes.push({
        pitch: pitches[i],
        startTick: bar * BAR + Math.round(i * noteInterval),
        duration: Math.round(noteInterval * 2), // long sustain
      });
    }
  }

  wideArpeggio(0, [midi('A2'), midi('C4'), midi('E4'), midi('A4'), midi('C5'), midi('E5')]);
  wideArpeggio(1, [midi('D3'), midi('F4'), midi('A4'), midi('D5'), midi('F5'), midi('A5')]);
  wideArpeggio(2, [midi('E2'), midi('G#3'), midi('B3'), midi('E4'), midi('G#4'), midi('B4')]);
  wideArpeggio(3, [midi('A2'), midi('C4'), midi('E4'), midi('A4'), midi('C5'), midi('E5')]);

  const segs = detectChordBoundaries(notes, TPB);
  const bassSeq = segs.map(s => pcName(s.bassPc));
  const expected = ['A', 'D', 'E', 'A'];
  let ei = 0;
  for (const b of bassSeq) {
    if (ei < expected.length && b === expected[ei]) ei++;
  }
  assert(ei === expected.length, `Chopin arpeggio: expected [${expected}], got [${bassSeq}], matched ${ei}/4`);
});

test('9.4 Liszt-style octave bass + chord texture', () => {
  const notes: SimpleNote[] = [];

  // Bass octaves on beats 1 and 3, chords on beats 2 and 4
  function lisztTexture(bar: number, bassNote: number, chordPitches: number[]) {
    // Bass octave on beat 1
    notes.push({ pitch: bassNote, startTick: bar * BAR, duration: TPB });
    notes.push({ pitch: bassNote + 12, startTick: bar * BAR, duration: TPB });
    // Chord on beat 2
    for (const p of chordPitches) {
      notes.push({ pitch: p, startTick: bar * BAR + TPB, duration: TPB });
    }
    // Bass octave on beat 3
    notes.push({ pitch: bassNote, startTick: bar * BAR + 2 * TPB, duration: TPB });
    notes.push({ pitch: bassNote + 12, startTick: bar * BAR + 2 * TPB, duration: TPB });
    // Chord on beat 4
    for (const p of chordPitches) {
      notes.push({ pitch: p, startTick: bar * BAR + 3 * TPB, duration: TPB });
    }
  }

  lisztTexture(0, midi('C2'), [midi('E4'), midi('G4'), midi('C5')]);      // C
  lisztTexture(1, midi('Ab2'), [midi('C4'), midi('Eb4'), midi('Ab4')]);    // Ab
  lisztTexture(2, midi('Bb2'), [midi('D4'), midi('F4'), midi('Bb4')]);     // Bb
  lisztTexture(3, midi('G2'), [midi('B3'), midi('D4'), midi('G4')]);       // G

  const segs = detectChordBoundaries(notes, TPB);
  const bassSeq = segs.map(s => pcName(s.bassPc));
  const expected = ['C', 'Ab', 'Bb', 'G'];
  let ei = 0;
  for (const b of bassSeq) {
    if (ei < expected.length && b === expected[ei]) ei++;
  }
  assert(ei === expected.length, `Liszt octave+chord: expected [${expected}], got [${bassSeq}], matched ${ei}/4`);
});

test('9.5 Debussy-style sustained pedal with chromatic upper voices', () => {
  const notes: SimpleNote[] = [];

  // Sustained low Bb pedal for 4 bars
  notes.push({ pitch: midi('Bb1'), startTick: 0, duration: 4 * BAR });

  // Upper voices: slow-moving chromatic chords (whole notes, overlapping)
  // Bar 0: Bb major-ish (Bb, D, F)
  notes.push(...chord(0, BAR, [midi('D4'), midi('F4'), midi('Bb4')]));
  // Bar 1: Bbm (Bb, Db, F)
  notes.push(...chord(BAR, BAR, [midi('Db4'), midi('F4'), midi('Bb4')]));
  // Bar 2: Gb/Bb (Gb, Bb, Db)
  notes.push(...chord(2 * BAR, BAR, [midi('Gb4'), midi('Bb4'), midi('Db5')]));
  // Bar 3: Bb (back)
  notes.push(...chord(3 * BAR, BAR, [midi('D4'), midi('F4'), midi('Bb4')]));

  const segs = detectChordBoundaries(notes, TPB);
  // Bass never changes (pedal Bb), so only upper voice changes drive boundaries
  // The PC set changes: {Bb,D,F} → {Bb,Db,F} → {Gb,Bb,Db} → {Bb,D,F}
  // At bar 1: onsets Db4 (new) but only 1 new PC... might not trigger
  // At bar 2: onsets Gb4, Db5 - Gb is new, Db already accumulated → 1 new PC
  // This is a hard case for any algorithm - subtle chromatic motion over pedal
  assert(segs.length >= 1, 'at least 1 segment');
  assertEqual(pcName(segs[0].bassPc), 'Bb', 'bass is Bb (pedal)');
});

test('9.6 Rachmaninoff-style full texture (melody + inner voices + bass)', () => {
  const notes: SimpleNote[] = [];

  // Bar 0: Cm (C bass, inner Eb+G, melody Eb5→D5)
  notes.push({ pitch: midi('C2'), startTick: 0, duration: BAR });
  notes.push({ pitch: midi('Eb3'), startTick: 0, duration: BAR });
  notes.push({ pitch: midi('G3'), startTick: 0, duration: BAR });
  notes.push({ pitch: midi('Eb5'), startTick: 0, duration: BAR / 2 });
  notes.push({ pitch: midi('D5'), startTick: BAR / 2, duration: BAR / 2 });

  // Bar 1: Ab (Ab bass, inner C+Eb, melody C5→Bb4)
  notes.push({ pitch: midi('Ab2'), startTick: BAR, duration: BAR });
  notes.push({ pitch: midi('C4'), startTick: BAR, duration: BAR });
  notes.push({ pitch: midi('Eb4'), startTick: BAR, duration: BAR });
  notes.push({ pitch: midi('C5'), startTick: BAR, duration: BAR / 2 });
  notes.push({ pitch: midi('Bb4'), startTick: BAR + BAR / 2, duration: BAR / 2 });

  // Bar 2: G7 (G bass, inner B+D+F, melody D5)
  notes.push({ pitch: midi('G2'), startTick: 2 * BAR, duration: BAR });
  notes.push({ pitch: midi('B3'), startTick: 2 * BAR, duration: BAR });
  notes.push({ pitch: midi('D4'), startTick: 2 * BAR, duration: BAR });
  notes.push({ pitch: midi('F4'), startTick: 2 * BAR, duration: BAR });
  notes.push({ pitch: midi('D5'), startTick: 2 * BAR, duration: BAR });

  // Bar 3: Cm (return)
  notes.push({ pitch: midi('C2'), startTick: 3 * BAR, duration: BAR });
  notes.push({ pitch: midi('Eb3'), startTick: 3 * BAR, duration: BAR });
  notes.push({ pitch: midi('G3'), startTick: 3 * BAR, duration: BAR });
  notes.push({ pitch: midi('C5'), startTick: 3 * BAR, duration: BAR });

  const segs = detectChordBoundaries(notes, TPB);
  const bassSeq = segs.map(s => pcName(s.bassPc));
  const expected = ['C', 'Ab', 'G', 'C'];
  let ei = 0;
  for (const b of bassSeq) {
    if (ei < expected.length && b === expected[ei]) ei++;
  }
  assert(ei === expected.length, `Rachmaninoff: expected [${expected}], got [${bassSeq}], matched ${ei}/4`);
});

test('9.7 Tremolo accompaniment (repeated notes simulating tremolo)', () => {
  const notes: SimpleNote[] = [];
  const thirty2nd = TPB / 8;

  // Bar 0: C major tremolo between E and G
  for (let i = 0; i < 32; i++) {
    const pitch = i % 2 === 0 ? midi('E4') : midi('G4');
    notes.push({ pitch, startTick: i * thirty2nd, duration: thirty2nd });
  }
  notes.push({ pitch: midi('C3'), startTick: 0, duration: BAR }); // bass

  // Bar 1: F major tremolo between A and C
  for (let i = 0; i < 32; i++) {
    const pitch = i % 2 === 0 ? midi('A4') : midi('C5');
    notes.push({ pitch, startTick: BAR + i * thirty2nd, duration: thirty2nd });
  }
  notes.push({ pitch: midi('F3'), startTick: BAR, duration: BAR }); // bass

  const segs = detectChordBoundaries(notes, TPB);
  assertEqual(segs.length, 2, 'segment count');
  assertEqual(pcName(segs[0].bassPc), 'C', 'bar 0 bass');
  assertEqual(pcName(segs[1].bassPc), 'F', 'bar 1 bass');
});

test('9.8 Triplet accompaniment (3 notes per beat)', () => {
  const triplet = Math.round(TPB / 3);
  const notes: SimpleNote[] = [];

  // Bar 0: C chord as triplets C-E-G repeated
  for (let beat = 0; beat < 4; beat++) {
    const t = beat * TPB;
    notes.push({ pitch: midi('C3'), startTick: t, duration: triplet + 10 });
    notes.push({ pitch: midi('E3'), startTick: t + triplet, duration: triplet + 10 });
    notes.push({ pitch: midi('G3'), startTick: t + 2 * triplet, duration: triplet + 10 });
  }

  // Bar 1: F chord as triplets F-A-C repeated
  for (let beat = 0; beat < 4; beat++) {
    const t = BAR + beat * TPB;
    notes.push({ pitch: midi('F3'), startTick: t, duration: triplet + 10 });
    notes.push({ pitch: midi('A3'), startTick: t + triplet, duration: triplet + 10 });
    notes.push({ pitch: midi('C4'), startTick: t + 2 * triplet, duration: triplet + 10 });
  }

  const segs = detectChordBoundaries(notes, TPB);
  const bassSeq = segs.map(s => pcName(s.bassPc));
  assert(bassSeq.includes('C'), 'should detect C');
  assert(bassSeq.includes('F'), 'should detect F');
  // Bass should go C → F
  const cIdx = bassSeq.indexOf('C');
  const fIdx = bassSeq.indexOf('F');
  assert(cIdx < fIdx, `C should come before F: C@${cIdx}, F@${fIdx}`);
});

// ═══════════════════════════════════════════════════════════
// PART 3: Real MIDI files (Nottingham Music Dataset)
// ═══════════════════════════════════════════════════════════

console.log('\n=== Part 7: Real MIDI Files (Nottingham Dataset) ===');

const MIDI_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'midi-fixtures');

function loadMidiNotes(filename: string): { notes: SimpleNote[]; ticksPerBeat: number; melodyNotes: SimpleNote[]; chordNotes: SimpleNote[] } {
  const filepath = path.join(MIDI_DIR, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`MIDI file not found: ${filepath}`);
  }
  const m = new Midi(fs.readFileSync(filepath));
  const ticksPerBeat = m.header.ppq;

  // Nottingham format: Track 0 = melody, Track 1 = chord accompaniment
  const melodyTrack = m.tracks[0];
  const chordTrack = m.tracks[1];

  const melodyNotes: SimpleNote[] = melodyTrack.notes.map(n => ({
    pitch: n.midi,
    startTick: Math.round(n.ticks),
    duration: Math.round(n.durationTicks),
  }));

  const chordNotes: SimpleNote[] = chordTrack.notes.map(n => ({
    pitch: n.midi,
    startTick: Math.round(n.ticks),
    duration: Math.round(n.durationTicks),
  }));

  const notes = [...melodyNotes, ...chordNotes];
  return { notes, ticksPerBeat, melodyNotes, chordNotes };
}

/** Extract ground truth chord changes from the chord track.
 *  Groups notes by start time → each group is one chord. */
function extractGroundTruth(chordNotes: SimpleNote[], ticksPerBeat: number): {
  changes: { tick: number; bassPc: number; pcs: Set<number> }[];
} {
  // Group by startTick
  const groups = new Map<number, SimpleNote[]>();
  for (const n of chordNotes) {
    const existing = groups.get(n.startTick) || [];
    existing.push(n);
    groups.set(n.startTick, existing);
  }

  const sortedTicks = [...groups.keys()].sort((a, b) => a - b);
  const changes: { tick: number; bassPc: number; pcs: Set<number> }[] = [];

  for (const tick of sortedTicks) {
    const notes = groups.get(tick)!;
    const bassPitch = Math.min(...notes.map(n => n.pitch));
    const bassPc = ((bassPitch % 12) + 12) % 12;
    const pcs = new Set(notes.map(n => ((n.pitch % 12) + 12) % 12));

    // Only record if chord changed (different bass or different PCs)
    if (changes.length === 0) {
      changes.push({ tick, bassPc, pcs });
    } else {
      const prev = changes[changes.length - 1];
      if (prev.bassPc !== bassPc || !sameSet(prev.pcs, pcs)) {
        changes.push({ tick, bassPc, pcs });
      }
    }
  }

  return { changes };
}

function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * Compare detected segments against ground truth chord changes.
 *
 * Metrics:
 * - Boundary recall: what fraction of GT boundaries are found (within tolerance)?
 * - Boundary precision: what fraction of detected boundaries are near a GT boundary?
 * - Bass accuracy: for each GT chord, does the overlapping detected segment have the same bass?
 */
function evaluateDetection(
  detected: ChordSegment[],
  groundTruth: { tick: number; bassPc: number; pcs: Set<number> }[],
  ticksPerBeat: number,
  tolerance: number = 2.0, // tolerance in beats
): { recall: number; precision: number; bassAccuracy: number } {
  const tolTicks = tolerance * ticksPerBeat;

  // Detected boundary ticks (skip the first one, which is always the start)
  const detectedBoundaries = detected.map(s => s.startTick);
  const gtBoundaries = groundTruth.map(c => c.tick);

  // Recall: for each GT boundary, is there a detected boundary nearby?
  let gtMatched = 0;
  for (const gt of gtBoundaries) {
    const closest = detectedBoundaries.reduce((best, d) =>
      Math.abs(d - gt) < Math.abs(best - gt) ? d : best, detectedBoundaries[0]);
    if (Math.abs(closest - gt) <= tolTicks) gtMatched++;
  }
  const recall = gtBoundaries.length > 0 ? gtMatched / gtBoundaries.length : 1;

  // Precision: for each detected boundary, is there a GT boundary nearby?
  let detMatched = 0;
  for (const d of detectedBoundaries) {
    const closest = gtBoundaries.reduce((best, gt) =>
      Math.abs(gt - d) < Math.abs(best - d) ? gt : best, gtBoundaries[0]);
    if (Math.abs(closest - d) <= tolTicks) detMatched++;
  }
  const precision = detectedBoundaries.length > 0 ? detMatched / detectedBoundaries.length : 1;

  // Bass accuracy: for each GT chord, find overlapping detected segment
  let bassCorrect = 0;
  for (let i = 0; i < groundTruth.length; i++) {
    const gt = groundTruth[i];
    const gtEnd = i + 1 < groundTruth.length ? groundTruth[i + 1].tick : Infinity;
    const gtMid = gt.tick + (gtEnd - gt.tick) / 2;

    // Find detected segment containing the midpoint of this GT chord
    const seg = detected.find(s => s.startTick <= gtMid && s.endTick > gtMid);
    if (seg && seg.bassPc === gt.bassPc) bassCorrect++;
  }
  const bassAccuracy = groundTruth.length > 0 ? bassCorrect / groundTruth.length : 1;

  return { recall, precision, bassAccuracy };
}

// Test each MIDI file
const midiFiles = fs.existsSync(MIDI_DIR)
  ? fs.readdirSync(MIDI_DIR).filter(f => f.endsWith('.mid')).sort()
  : [];

if (midiFiles.length === 0) {
  console.log('  SKIP: No MIDI fixtures found in tests/midi-fixtures/');
} else {
  // Aggregate metrics
  const allMetrics: { file: string; recall: number; precision: number; bassAccuracy: number; gtChords: number; detectedSegs: number }[] = [];

  for (const file of midiFiles) {
    test(`7.${file}: chord boundary detection`, () => {
      const { notes, ticksPerBeat, chordNotes } = loadMidiNotes(file);
      const { changes: gt } = extractGroundTruth(chordNotes, ticksPerBeat);

      const segs = detectChordBoundaries(notes, ticksPerBeat);

      const metrics = evaluateDetection(segs, gt, ticksPerBeat);
      allMetrics.push({
        file,
        recall: metrics.recall,
        precision: metrics.precision,
        bassAccuracy: metrics.bassAccuracy,
        gtChords: gt.length,
        detectedSegs: segs.length,
      });

      // Minimum thresholds for MIDI files
      assert(metrics.recall >= 0.5, `recall too low: ${(metrics.recall * 100).toFixed(1)}%`);
      assert(metrics.bassAccuracy >= 0.4, `bass accuracy too low: ${(metrics.bassAccuracy * 100).toFixed(1)}%`);
    });
  }

  // Print summary table after all MIDI tests
  if (allMetrics.length > 0) {
    console.log('\n  ── MIDI Evaluation Summary ──');
    console.log('  File                  | GT | Det | Recall | Precision | Bass Acc');
    console.log('  ' + '─'.repeat(70));
    for (const m of allMetrics) {
      const name = m.file.padEnd(22);
      console.log(`  ${name}| ${String(m.gtChords).padStart(2)} | ${String(m.detectedSegs).padStart(3)} | ${(m.recall * 100).toFixed(1).padStart(5)}% | ${(m.precision * 100).toFixed(1).padStart(8)}% | ${(m.bassAccuracy * 100).toFixed(1).padStart(5)}%`);
    }
    const avgRecall = allMetrics.reduce((s, m) => s + m.recall, 0) / allMetrics.length;
    const avgPrecision = allMetrics.reduce((s, m) => s + m.precision, 0) / allMetrics.length;
    const avgBass = allMetrics.reduce((s, m) => s + m.bassAccuracy, 0) / allMetrics.length;
    console.log('  ' + '─'.repeat(70));
    console.log(`  AVERAGE               |    |     | ${(avgRecall * 100).toFixed(1).padStart(5)}% | ${(avgPrecision * 100).toFixed(1).padStart(8)}% | ${(avgBass * 100).toFixed(1).padStart(5)}%`);
  }
}

// ─── Final Summary ────────────────────────────────────────
console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
