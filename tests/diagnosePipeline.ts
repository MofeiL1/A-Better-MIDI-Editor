/**
 * Diagnostic: trace chord boundary detection + chord naming through
 * the full production pipeline for arpeggiated textures.
 */
import { detectChordBoundaries, type ChordSegment } from '../src/utils/chordBoundary';
import { detectChordsFromNotes } from '../src/utils/chordDetection';
import { generateId } from '../src/utils/id';

const TPB = 480;
const BAR = TPB * 4;
const BEAT = TPB;
const EIGHTH = TPB / 2;
const HALF = TPB * 2;
const QUARTER = TPB;

type Note = { id: string; pitch: number; startTick: number; duration: number; velocity: number; channel: number; pitchBend: number[] };

const notes: Note[] = [];
const add = (pitch: number, startTick: number, duration: number) => {
  notes.push({ id: generateId(), pitch, startTick, duration, velocity: 75, channel: 0, pitchBend: [] });
};

// Reproduce the arpeggio helper from the demo
const arpeggio = (bar: number, bass: number, tones: number[]) => {
  const t = bar * BAR;
  add(bass, t, QUARTER);
  const positions = [EIGHTH, EIGHTH*2, EIGHTH*3, EIGHTH*4, EIGHTH*5, EIGHTH*6];
  for (let i = 0; i < positions.length; i++) {
    add(tones[i % tones.length], t + BEAT + positions[i] - EIGHTH, EIGHTH);
  }
};

const mel = (bar: number, beat: number, pitch: number, dur: number) => {
  add(pitch, bar * BAR + beat * BEAT, dur);
};

// Section C bars 24-29 (arpeggiated)
arpeggio(24, 36, [48, 52, 55, 59]);  // Cmaj7
mel(24, 0, 72, HALF);
mel(24, 2, 69, HALF);

arpeggio(25, 29, [41, 45, 48, 52]);  // Fmaj7
mel(25, 0, 77, HALF);
mel(25, 2, 76, HALF);

arpeggio(26, 34, [46, 50, 53, 57]);  // Bbmaj7
mel(26, 0, 74, HALF);
mel(26, 2, 77, HALF);

arpeggio(27, 31, [43, 46, 50, 53]);  // Gm7
mel(27, 0, 79, HALF);
mel(27, 2, 77, QUARTER);
mel(27, 3, 74, QUARTER);

arpeggio(28, 36, [48, 52, 55, 58]);  // C7
mel(28, 0, 76, HALF);
mel(28, 2, 72, HALF);

arpeggio(29, 29, [41, 45, 48, 52]);  // Fmaj7
mel(29, 0, 77, BAR);

const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

console.log('\n=== Notes per bar ===');
for (let bar = 24; bar <= 29; bar++) {
  const barNotes = notes.filter(n => n.startTick >= bar * BAR && n.startTick < (bar+1) * BAR)
    .sort((a,b) => a.startTick - b.startTick || a.pitch - b.pitch);
  console.log(`\nBar ${bar}:`);
  for (const n of barNotes) {
    const beat = ((n.startTick - bar * BAR) / BEAT).toFixed(2);
    const name = NAMES[n.pitch % 12] + Math.floor(n.pitch / 12 - 1);
    console.log(`  beat ${beat}: ${name} (pitch ${n.pitch}) dur=${n.duration}t (${(n.duration/BEAT).toFixed(1)} beats)`);
  }
}

const simpleNotes = notes.map(n => ({ pitch: n.pitch, startTick: n.startTick, duration: n.duration }));
const segments = detectChordBoundaries(simpleNotes, TPB);

console.log('\n=== Chord Boundary Segments ===');
for (const seg of segments) {
  const startBar = (seg.startTick / BAR).toFixed(2);
  const endBar = (seg.endTick / BAR).toFixed(2);
  const dur = ((seg.endTick - seg.startTick) / BEAT).toFixed(1);
  const bass = NAMES[seg.bassPc];
  const pcs = [...seg.pcs].map(pc => NAMES[pc]).join(', ');
  console.log(`  bars [${startBar} - ${endBar}] (${dur} beats) bass=${bass}  pcs={${pcs}}`);
}

console.log('\n=== Detected ChordEvents (production pipeline) ===');
const chords = detectChordsFromNotes(notes, TPB);
for (const c of chords) {
  const startBar = (c.startTick / BAR).toFixed(2);
  const endBar = (c.endTick / BAR).toFixed(2);
  const root = NAMES[c.root];
  const bass = c.bass !== undefined ? '/' + NAMES[c.bass] : '';
  console.log(`  [${startBar} - ${endBar}] ${root}${c.quality}${bass}  conf=${c.confidence.toFixed(2)}`);
}

console.log('\n=== Expected ===');
console.log('  Bar 24: Cmaj7 (C-E-G-B)');
console.log('  Bar 25: Fmaj7 (F-A-C-E)');
console.log('  Bar 26: Bbmaj7 (Bb-D-F-A)');
console.log('  Bar 27: Gm7 (G-Bb-D-F)');
console.log('  Bar 28: C7 (C-E-G-Bb)');
console.log('  Bar 29: Fmaj7 (F-A-C-E)');

// Debug PC weights for bar 24
console.log('\n=== PC weights for bar 24 segment ===');
const seg24 = segments[0];
const BEAT_TICKS = TPB;
for (let pc = 0; pc < 12; pc++) {
  if (seg24.pcWeights[pc] > 0) {
    console.log(`  ${NAMES[pc]}: weight=${seg24.pcWeights[pc]} (${(seg24.pcWeights[pc] / Math.max(...seg24.pcWeights) * 100).toFixed(1)}%)`);
  }
}

// Debug PC weights for bar 29 segment
const seg29 = segments.find(s => s.startTick === 29 * BAR);
if (seg29) {
  console.log('\n=== PC weights for bar 29 segment ===');
  for (let pc = 0; pc < 12; pc++) {
    if (seg29.pcWeights[pc] > 0) {
      console.log(`  ${NAMES[pc]}: weight=${seg29.pcWeights[pc]} (${(seg29.pcWeights[pc] / Math.max(...seg29.pcWeights) * 100).toFixed(1)}%)`);
    }
  }
}
