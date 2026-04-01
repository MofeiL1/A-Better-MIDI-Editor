import { Midi } from '@tonejs/midi';
import type { Project, Note } from '../types/model';
import { generateId } from './id';
import { getEffectiveDuration } from './noteDuration';

/**
 * Parse a MIDI file to extract track info for selection.
 */
export async function parseMidiTracks(file: File) {
  const buffer = await file.arrayBuffer();
  const midi = new Midi(buffer);
  return { midi };
}

/**
 * Build our Project from parsed MIDI data.
 */
export function buildProjectFromMidi(
  midi: InstanceType<typeof Midi>,
  fileName: string,
  selectedTrackIndices?: number[],
): Project {
  const ticksPerBeat = midi.header.ppq;
  // If ppq is a getter-only, override it
  if (ticksPerBeat !== midi.header.ppq) {
    Object.defineProperty(midi.header, 'ppq', { value: ticksPerBeat, writable: false, configurable: true });
  }

  const selectedTracks = selectedTrackIndices
    ? selectedTrackIndices.map((i) => midi.tracks[i]).filter(Boolean)
    : midi.tracks.filter((t) => t.notes.length > 0);

  const allNotes: Note[] = selectedTracks.flatMap((track) =>
    track.notes.map((n) => ({
      id: generateId(),
      pitch: n.midi,
      startTick: Math.round(n.ticks),
      duration: Math.round(n.durationTicks),
      velocity: Math.round(n.velocity * 127),
      channel: 0,
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

  const tsSig = project.timeSignatureChanges[0] ?? { numerator: 4, denominator: 4 };
  const ticksPerMeasure = project.ticksPerBeat * tsSig.numerator * (4 / tsSig.denominator);

  for (const track of project.tracks) {
    const midiTrack = midi.addTrack();
    midiTrack.name = track.name;

    for (const clip of track.clips) {
      for (const note of clip.notes) {
        const absoluteTick = clip.startTick + note.startTick;
        const effectiveDur = getEffectiveDuration(note, clip.notes, ticksPerMeasure);
        midiTrack.addNote({
          midi: note.pitch,
          ticks: absoluteTick,
          durationTicks: effectiveDur,
          velocity: note.velocity / 127,
        });
      }
    }
  }

  const arr = midi.toArray();
  return new Blob([new Uint8Array(arr)], { type: 'audio/midi' });
}
