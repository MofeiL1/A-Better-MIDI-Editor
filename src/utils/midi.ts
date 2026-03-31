import { Midi } from '@tonejs/midi';
import type { Project } from '../types/model';
import { generateId } from './id';

export interface MidiTrackInfo {
  index: number;
  name: string;
  noteCount: number;
  instrument: string;
}

/**
 * Parse a MIDI file and return track info for user selection.
 */
export async function parseMidiTracks(file: File): Promise<{ midi: Midi; tracks: MidiTrackInfo[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);
  const tracks = midi.tracks
    .map((t, i) => ({
      index: i,
      name: t.name || `Track ${i + 1}`,
      noteCount: t.notes.length,
      instrument: t.instrument?.name ?? 'piano',
    }))
    .filter((t) => t.noteCount > 0);
  return { midi, tracks };
}

/**
 * Import specific tracks from a parsed MIDI into our Project format.
 * If trackIndices is null/undefined, import all tracks with notes.
 */
export function buildProjectFromMidi(midi: Midi, fileName: string, trackIndices?: number[]): Project {
  const ticksPerBeat = midi.header.ppq;

  const selectedTracks = trackIndices
    ? midi.tracks.filter((_, i) => trackIndices.includes(i))
    : midi.tracks.filter((t) => t.notes.length > 0);

  // Merge all selected tracks into one clip (single-track piano roll)
  const allNotes = selectedTracks.flatMap((midiTrack) =>
    midiTrack.notes.map((n) => ({
      id: generateId(),
      pitch: n.midi,
      startTick: Math.round(n.ticks),
      duration: Math.max(1, Math.round(n.durationTicks)),
      velocity: Math.max(1, Math.min(127, Math.round(n.velocity * 127))),
      channel: midiTrack.channel ?? 0,
      pitchBend: [] as { tick: number; value: number }[],
    }))
  );

  const trackName = selectedTracks.length === 1
    ? (selectedTracks[0].name || 'Track 1')
    : fileName.replace(/\.midi?$/i, '');

  const tracks = [{
    id: generateId(),
    name: trackName,
    instrument: selectedTracks[0]?.instrument?.name ?? 'piano',
    muted: false,
    solo: false,
    clips: [{ id: generateId(), startTick: 0, notes: allNotes }],
  }];

  const rawTempos = [...midi.header.tempos].sort((a, b) => a.ticks - b.ticks);
  const tempoChanges = rawTempos.length > 0
    ? rawTempos.map((t) => ({
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
    name: fileName.replace(/\.midi?$/i, ''),
    ticksPerBeat,
    tracks,
    tempoChanges,
    timeSignatureChanges,
    keyChanges: [{ tick: 0, key: 'C major' }],
    chordEvents: [],
    history: [],
    redoStack: [],
  };
}

/**
 * Import a MIDI file — convenience wrapper (imports all tracks with notes).
 */
export async function importMidi(file: File): Promise<Project> {
  const { midi } = await parseMidiTracks(file);
  return buildProjectFromMidi(midi, file.name);
}

/**
 * Export our Project to a MIDI file blob.
 */
export function exportMidi(project: Project): Blob {
  const midi = new Midi();
  Object.defineProperty(midi.header, 'ppq', { value: project.ticksPerBeat, writable: false, configurable: true });

  for (const tc of project.tempoChanges) {
    midi.header.tempos.push({ ticks: tc.tick, bpm: tc.bpm });
  }

  for (const ts of project.timeSignatureChanges) {
    midi.header.timeSignatures.push({
      ticks: ts.tick,
      timeSignature: [ts.numerator, ts.denominator],
    });
  }

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

  const arr = midi.toArray();
  return new Blob([new Uint8Array(arr)], { type: 'audio/midi' });
}
