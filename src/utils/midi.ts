import { Midi } from '@tonejs/midi';
import type { Project } from '../types/model';
import { generateId } from './id';

/**
 * Import a MIDI file into our Project format.
 */
export async function importMidi(file: File): Promise<Project> {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);

  const ticksPerBeat = midi.header.ppq;

  const tracks = midi.tracks.map((midiTrack, index) => ({
    id: generateId(),
    name: midiTrack.name || `Track ${index + 1}`,
    instrument: midiTrack.instrument?.name ?? 'piano',
    muted: false,
    solo: false,
    clips: [
      {
        id: generateId(),
        startTick: 0,
        notes: midiTrack.notes.map((n) => ({
          id: generateId(),
          pitch: n.midi,
          startTick: Math.round(n.ticks),
          duration: Math.round(n.durationTicks),
          velocity: Math.round(n.velocity * 127),
          channel: midiTrack.channel ?? 0,
          pitchBend: [],
        })),
      },
    ],
  }));

  const tempoChanges = midi.header.tempos.length > 0
    ? midi.header.tempos.map((t) => ({
        tick: Math.round(t.ticks),
        bpm: Math.round(t.bpm * 100) / 100,
      }))
    : [{ tick: 0, bpm: 120 }];

  const timeSignatureChanges = midi.header.timeSignatures.length > 0
    ? midi.header.timeSignatures.map((ts) => ({
        tick: Math.round(ts.ticks),
        numerator: ts.timeSignature[0],
        denominator: ts.timeSignature[1],
      }))
    : [{ tick: 0, numerator: 4, denominator: 4 }];

  return {
    name: file.name.replace(/\.midi?$/i, ''),
    ticksPerBeat,
    tracks,
    tempoChanges,
    timeSignatureChanges,
    keyChanges: [{ tick: 0, key: 'C major' }],
    chordRegions: [],
    history: [],
    redoStack: [],
  };
}

/**
 * Export our Project to a MIDI file blob.
 */
export function exportMidi(project: Project): Blob {
  const midi = new Midi();
  midi.header.ppq = project.ticksPerBeat;

  // Set tempo
  for (const tc of project.tempoChanges) {
    midi.header.tempos.push({ ticks: tc.tick, bpm: tc.bpm });
  }

  // Set time signatures
  for (const ts of project.timeSignatureChanges) {
    midi.header.timeSignatures.push({
      ticks: ts.tick,
      timeSignature: [ts.numerator, ts.denominator],
    });
  }

  // Tracks
  for (const track of project.tracks) {
    const midiTrack = midi.addTrack();
    midiTrack.name = track.name;

    for (const clip of track.clips) {
      for (const note of clip.notes) {
        const absoluteTick = clip.startTick + note.startTick;
        midiTrack.addNote({
          midi: note.pitch,
          ticks: absoluteTick,
          durationTicks: note.duration,
          velocity: note.velocity / 127,
        });
      }
    }
  }

  return new Blob([midi.toArray()], { type: 'audio/midi' });
}
