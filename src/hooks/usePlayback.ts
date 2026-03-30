import { useRef, useCallback, useEffect } from 'react';
import * as Tone from 'tone';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';
import { tickToSeconds } from '../utils/timing';

export function usePlayback() {
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const animRef = useRef<number>(0);
  const startTickRef = useRef(0);

  const getSynth = useCallback(() => {
    if (!synthRef.current) {
      synthRef.current = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.4 },
        volume: -8,
      }).toDestination();
    }
    return synthRef.current;
  }, []);

  const play = useCallback(async () => {
    await Tone.start();
    const synth = getSynth();
    const { project } = useProjectStore.getState();
    const { activeClipId, playheadTick, setIsPlaying, setPlayheadTick } = useUiStore.getState();

    const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === activeClipId);
    if (!clip) return;

    const bpm = project.tempoChanges[0]?.bpm ?? 120;
    const tpb = project.ticksPerBeat;

    Tone.getTransport().bpm.value = bpm;
    Tone.getTransport().cancel();

    startTickRef.current = playheadTick;
    const startOffset = tickToSeconds(playheadTick, bpm, tpb);

    // Schedule notes
    for (const note of clip.notes) {
      const noteStartSec = tickToSeconds(note.startTick, bpm, tpb) - startOffset;
      const noteDurSec = tickToSeconds(note.duration, bpm, tpb);
      if (noteStartSec < 0) continue;

      const freq = Tone.Frequency(note.pitch, 'midi').toFrequency();
      Tone.getTransport().schedule(() => {
        synth.triggerAttackRelease(freq, noteDurSec, undefined, note.velocity / 127);
      }, noteStartSec);
    }

    Tone.getTransport().start();
    setIsPlaying(true);

    // Animate playhead
    const startTime = Tone.now();
    const tick = () => {
      const elapsed = Tone.now() - startTime;
      const currentTick = startTickRef.current + (elapsed / 60) * bpm * tpb;
      setPlayheadTick(Math.round(currentTick));
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, [getSynth]);

  const stop = useCallback(() => {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    cancelAnimationFrame(animRef.current);
    useUiStore.getState().setIsPlaying(false);
  }, []);

  const togglePlayback = useCallback(() => {
    if (useUiStore.getState().isPlaying) {
      stop();
    } else {
      play();
    }
  }, [play, stop]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      synthRef.current?.dispose();
    };
  }, []);

  return { play, stop, togglePlayback };
}
