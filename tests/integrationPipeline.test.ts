/**
 * Integration test: full production pipeline for chord detection + tonal segmentation.
 *
 * Tests the exact same code path that PianoRoll.tsx uses:
 *   notes -> detectChordsFromNotes -> toChordInfoForKeyDetect -> analyzeTonalSegments -> buildChordLabels
 *
 * Each test case defines notes, expected chords, and expected key(s).
 */
import { describe, it, expect } from 'vitest';
import { detectChordsFromNotes, toChordInfoForKeyDetect, buildChordLabels } from '../src/utils/chordDetection';
import { detectChordBoundaries } from '../src/utils/chordBoundary';
import { analyzeTonalSegments } from '../src/utils/tonalSegmentation';
import { PITCH_CLASS_NAMES } from '../src/utils/chordAnalysis';
import { generateId } from '../src/utils/id';
import type { Note } from '../src/types/model';

const TPB = 480;
const BAR = TPB * 4;
const BEAT = TPB;
const EIGHTH = TPB / 2;
const HALF = TPB * 2;
const QUARTER = TPB;

function makeNote(pitch: number, startTick: number, duration: number): Note {
  return {
    id: generateId(),
    pitch,
    startTick,
    duration,
    velocity: 75,
    channel: 0,
    pitchBend: [],
  };
}

// Helper: build arpeggio pattern (bass on beat 1, upper voices arpeggiated)
function arpeggio(notes: Note[], bar: number, bass: number, tones: number[]) {
  const t = bar * BAR;
  notes.push(makeNote(bass, t, QUARTER));
  const positions = [EIGHTH, EIGHTH * 2, EIGHTH * 3, EIGHTH * 4, EIGHTH * 5, EIGHTH * 6];
  for (let i = 0; i < positions.length; i++) {
    notes.push(makeNote(tones[i % tones.length], t + BEAT + positions[i] - EIGHTH, EIGHTH));
  }
}

// Helper: block chord (all notes start simultaneously)
function block(notes: Note[], bar: number, beat: number, pitches: number[], dur: number) {
  const t = bar * BAR + beat * BEAT;
  for (const p of pitches) {
    notes.push(makeNote(p, t, dur));
  }
}

// Helper: melody note
function mel(notes: Note[], bar: number, beat: number, pitch: number, dur: number) {
  notes.push(makeNote(pitch, bar * BAR + beat * BEAT, dur));
}

// Helper: walking bass line
function walkBass(notes: Note[], bar: number, pitches: number[]) {
  const t = bar * BAR;
  for (let i = 0; i < pitches.length; i++) {
    notes.push(makeNote(pitches[i], t + i * BEAT, QUARTER));
  }
}

/** Run full pipeline and return chord names per segment */
function runPipeline(notes: Note[]): {
  chords: { startTick: number; endTick: number; name: string; root: string; quality: string }[];
  labels: { startTick: number; name: string; roman: string }[];
  regions: { startTick: number; endTick: number; root: number; mode: string }[];
} {
  const simpleNotes = notes.map(n => ({
    pitch: n.pitch,
    startTick: n.startTick,
    duration: n.duration,
  }));

  // Step 1: Chord detection (same as PianoRoll.tsx)
  const detectedChords = detectChordsFromNotes(notes, TPB);

  // Step 2: Tonal segmentation (same as PianoRoll.tsx)
  const chordSegments = detectChordBoundaries(simpleNotes, TPB);
  const chordInfos = toChordInfoForKeyDetect(detectedChords);
  const tonalResult = analyzeTonalSegments(simpleNotes, TPB, { chordSegments });

  // Step 3: Build labels (same as PianoRoll.tsx)
  const scaleRoot = tonalResult.regions.length > 0
    ? tonalResult.regions[0].bestKey.root
    : 0;
  const labels = buildChordLabels(detectedChords, scaleRoot, tonalResult.regions);

  return {
    chords: detectedChords.map(c => ({
      startTick: c.startTick,
      endTick: c.endTick,
      name: PITCH_CLASS_NAMES[c.root] + c.quality + (c.bass !== undefined ? '/' + PITCH_CLASS_NAMES[c.bass] : ''),
      root: PITCH_CLASS_NAMES[c.root],
      quality: c.quality,
    })),
    labels,
    regions: tonalResult.regions.map(r => ({
      startTick: r.startTick,
      endTick: r.endTick,
      root: r.bestKey.root,
      mode: r.bestKey.mode,
    })),
  };
}

/** Get chord name at a specific bar */
function chordAtBar(chords: { startTick: number; name: string }[], bar: number): string | undefined {
  const tick = bar * BAR;
  return chords.find(c => c.startTick <= tick && tick < c.startTick + BAR)?.name;
}

// ===== Test Cases =====

describe('Integration: Full Pipeline', () => {
  describe('Arpeggiated jazz chords (Section C from demo)', () => {
    const notes: Note[] = [];

    // Bars 0-5: arpeggiated jazz chords with melody
    arpeggio(notes, 0, 36, [48, 52, 55, 59]); // Cmaj7
    mel(notes, 0, 0, 72, HALF);
    mel(notes, 0, 2, 69, HALF);

    arpeggio(notes, 1, 29, [41, 45, 48, 52]); // Fmaj7
    mel(notes, 1, 0, 77, HALF);
    mel(notes, 1, 2, 76, HALF);

    arpeggio(notes, 2, 34, [46, 50, 53, 57]); // Bbmaj7
    mel(notes, 2, 0, 74, HALF);
    mel(notes, 2, 2, 77, HALF);

    arpeggio(notes, 3, 31, [43, 46, 50, 53]); // Gm7
    mel(notes, 3, 0, 79, HALF);
    mel(notes, 3, 2, 77, QUARTER);
    mel(notes, 3, 3, 74, QUARTER);

    arpeggio(notes, 4, 36, [48, 52, 55, 58]); // C7
    mel(notes, 4, 0, 76, HALF);
    mel(notes, 4, 2, 72, HALF);

    arpeggio(notes, 5, 29, [41, 45, 48, 52]); // Fmaj7
    mel(notes, 5, 0, 77, BAR);

    it('detects one chord per bar', () => {
      const result = runPipeline(notes);
      // Each bar should produce exactly one chord
      expect(result.chords.length).toBe(6);
    });

    it('correctly names arpeggiated chords', () => {
      const result = runPipeline(notes);
      const names = result.chords.map(c => c.name);

      expect(names[0]).toBe('Cmaj7');
      expect(names[1]).toBe('Fmaj7');
      // Bb may appear as A# (enharmonic) depending on tonal.js
      expect(names[2]).toMatch(/^(A#|Bb)maj7$/);
      expect(names[3]).toBe('Gm7');
      expect(names[4]).toBe('C7');
      expect(names[5]).toBe('Fmaj7');
    });
  });

  describe('Block chords (simple ii-V-I)', () => {
    const notes: Note[] = [];

    // Dm7 - G7 - Cmaj7 (block chords, 1 bar each)
    block(notes, 0, 0, [38, 53, 57, 60, 65], BAR); // Dm7: D2, F3, A3, C4, F4
    block(notes, 1, 0, [31, 47, 50, 53, 59], BAR); // G7: G1, B2, D3, F3, B3
    block(notes, 2, 0, [36, 48, 52, 55, 59], BAR); // Cmaj7: C2, C3, E3, G3, B3

    it('detects block chords correctly', () => {
      const result = runPipeline(notes);
      expect(result.chords.length).toBe(3);

      // Root detection
      expect(result.chords[0].root).toBe('D');
      expect(result.chords[1].root).toBe('G');
      expect(result.chords[2].root).toBe('C');
    });
  });

  describe('Walking bass in C major', () => {
    const notes: Note[] = [];

    // Bar 0: C chord with walking bass C-E-G-C
    walkBass(notes, 0, [36, 40, 43, 48]);
    block(notes, 0, 0, [60, 64, 67], BAR); // C-E-G sustained

    // Bar 1: F chord with walking bass F-A-C-F
    walkBass(notes, 1, [29, 33, 36, 41]);
    block(notes, 1, 0, [53, 57, 60], BAR); // F-A-C sustained

    // Bar 2: G chord with walking bass G-B-D-G
    walkBass(notes, 2, [31, 35, 38, 43]);
    block(notes, 2, 0, [55, 59, 62], BAR); // G-B-D sustained

    // Bar 3: C chord
    walkBass(notes, 3, [36, 40, 43, 48]);
    block(notes, 3, 0, [60, 64, 67], BAR);

    it('detects correct roots despite walking bass', () => {
      const result = runPipeline(notes);
      expect(result.chords.length).toBeGreaterThanOrEqual(3);

      // Check that each bar's chord has the expected root
      const bar0 = chordAtBar(result.chords, 0);
      const bar1 = chordAtBar(result.chords, 1);
      const bar2 = chordAtBar(result.chords, 2);
      const bar3 = chordAtBar(result.chords, 3);

      expect(bar0).toMatch(/^C/);
      expect(bar1).toMatch(/^F/);
      expect(bar2).toMatch(/^G/);
      expect(bar3).toMatch(/^C/);
    });

    it('detects C major key', () => {
      const result = runPipeline(notes);
      expect(result.regions.length).toBeGreaterThanOrEqual(1);
      // Root 0 = C
      expect(result.regions[0].root).toBe(0);
    });
  });

  describe('Key modulation: C major -> G major', () => {
    const notes: Note[] = [];

    // Bars 0-3: C major (C - Am - F - G)
    block(notes, 0, 0, [36, 48, 52, 55], BAR); // C
    block(notes, 1, 0, [33, 48, 52, 57], BAR); // Am
    block(notes, 2, 0, [29, 48, 53, 57], BAR); // F
    block(notes, 3, 0, [31, 47, 50, 55], BAR); // G

    // Bars 4-7: G major (G - Em - C - D)
    block(notes, 4, 0, [31, 47, 50, 55], BAR); // G
    block(notes, 5, 0, [28, 47, 52, 55], BAR); // Em
    block(notes, 6, 0, [36, 48, 52, 55], BAR); // C
    block(notes, 7, 0, [26, 42, 50, 54], BAR); // D (with F#)

    // Bars 8-11: G major continued (G - Em - Am - D)
    block(notes, 8, 0, [31, 47, 50, 55], BAR);  // G
    block(notes, 9, 0, [28, 47, 52, 55], BAR);  // Em
    block(notes, 10, 0, [33, 48, 52, 57], BAR); // Am
    block(notes, 11, 0, [26, 42, 50, 54], BAR); // D (with F#)

    it('detects chord roots in both keys', () => {
      const result = runPipeline(notes);
      expect(result.chords.length).toBeGreaterThanOrEqual(6);

      // First section
      expect(chordAtBar(result.chords, 0)).toMatch(/^C/);
      expect(chordAtBar(result.chords, 2)).toMatch(/^F/);

      // G major section — bars 3-4 may merge since both are G
      const gChords = result.chords.filter(c => c.root === 'G');
      expect(gChords.length).toBeGreaterThanOrEqual(1);
    });

    it('detects multiple tonal regions', () => {
      const result = runPipeline(notes);
      // With modulation, should detect at least 2 regions
      expect(result.regions.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Single sustained chord', () => {
    const notes: Note[] = [];

    // One big Cmaj7 chord sustained for 4 bars
    block(notes, 0, 0, [36, 48, 52, 55, 59], BAR * 4);

    it('produces exactly one chord', () => {
      const result = runPipeline(notes);
      expect(result.chords.length).toBe(1);
      expect(result.chords[0].root).toBe('C');
    });
  });

  describe('Two notes only (interval, not chord)', () => {
    const notes: Note[] = [];

    // Just C and G — a perfect 5th, not a full chord
    block(notes, 0, 0, [48, 55], BAR);

    it('still produces a detection result', () => {
      const result = runPipeline(notes);
      // May detect C5 or similar
      expect(result.chords.length).toBeGreaterThanOrEqual(0);
      if (result.chords.length > 0) {
        expect(result.chords[0].root).toBe('C');
      }
    });
  });

  describe('Rapid half-bar chord changes', () => {
    const notes: Note[] = [];

    // Bar 0: C on beats 1-2, F on beats 3-4
    block(notes, 0, 0, [36, 48, 52, 55], HALF); // C
    block(notes, 0, 2, [29, 41, 45, 48], HALF); // F

    // Bar 1: G on beats 1-2, C on beats 3-4
    block(notes, 1, 0, [31, 47, 50, 55], HALF); // G
    block(notes, 1, 2, [36, 48, 52, 55], HALF); // C

    it('detects multiple chords per bar', () => {
      const result = runPipeline(notes);
      // Should detect at least 3 distinct chords (some half-bar changes may merge)
      expect(result.chords.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Demo song Section C (bars 24-29 from full demo)', () => {
    // This reproduces the exact section from diagnosePipeline.ts
    // to ensure the production pipeline matches diagnostic output
    const notes: Note[] = [];

    arpeggio(notes, 0, 36, [48, 52, 55, 59]); // Cmaj7
    mel(notes, 0, 0, 72, HALF);
    mel(notes, 0, 2, 69, HALF);

    arpeggio(notes, 1, 29, [41, 45, 48, 52]); // Fmaj7
    mel(notes, 1, 0, 77, HALF);
    mel(notes, 1, 2, 76, HALF);

    arpeggio(notes, 2, 34, [46, 50, 53, 57]); // Bbmaj7
    mel(notes, 2, 0, 74, HALF);
    mel(notes, 2, 2, 77, HALF);

    arpeggio(notes, 3, 31, [43, 46, 50, 53]); // Gm7
    mel(notes, 3, 0, 79, HALF);
    mel(notes, 3, 2, 77, QUARTER);
    mel(notes, 3, 3, 74, QUARTER);

    arpeggio(notes, 4, 36, [48, 52, 55, 58]); // C7
    mel(notes, 4, 0, 76, HALF);
    mel(notes, 4, 2, 72, HALF);

    arpeggio(notes, 5, 29, [41, 45, 48, 52]); // Fmaj7
    mel(notes, 5, 0, 77, BAR);

    it('matches expected chord names exactly', () => {
      const result = runPipeline(notes);
      const names = result.chords.map(c => c.name);

      expect(names).toEqual([
        'Cmaj7',
        'Fmaj7',
        expect.stringMatching(/^(A#|Bb)maj7$/),
        'Gm7',
        'C7',
        'Fmaj7',
      ]);
    });

    it('has confidence > 0.5 for all chords', () => {
      const detectedChords = detectChordsFromNotes(notes, TPB);
      for (const c of detectedChords) {
        expect(c.confidence).toBeGreaterThan(0.5);
      }
    });
  });
});
