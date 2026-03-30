import { useRef, useCallback } from 'react';
import * as Tone from 'tone';
import { getPianoSampler } from '../audio/pianoSampler';

export function usePreviewNote() {
  const activeNote = useRef<string | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewNote = useCallback(async (
    pitch: number,
    durationSec?: number,
    velocity: number = 80,
  ) => {
    await Tone.start();
    const sampler = await getPianoSampler();
    const noteName = Tone.Frequency(pitch, 'midi').toNote();
    const vel = Math.max(0.01, velocity / 127);
    const dur = Math.max(0.05, durationSec ?? 0.3);

    // Stop previous preview immediately
    if (releaseTimer.current !== null) {
      clearTimeout(releaseTimer.current);
      releaseTimer.current = null;
    }
    if (activeNote.current !== null) {
      sampler.triggerRelease(activeNote.current, Tone.now());
      activeNote.current = null;
    }

    sampler.triggerAttack(noteName, Tone.now(), vel);
    activeNote.current = noteName;

    releaseTimer.current = setTimeout(() => {
      sampler.triggerRelease(noteName, Tone.now());
      if (activeNote.current === noteName) activeNote.current = null;
      releaseTimer.current = null;
    }, dur * 1000);
  }, []);

  return { previewNote };
}
