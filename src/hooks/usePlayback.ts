import { useRef, useCallback, useEffect } from 'react';
import * as Tone from 'tone';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';
import { tickToSeconds } from '../utils/timing';

export function usePlayback() {
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const animRef = useRef<number>(0);
  const startTickRef = useRef(0);
  const isPlayingRef = useRef(false);

  const getSynth = useCallback(() => {
    if (!synthRef.current) {
      synthRef.current = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.01, decay: 0.15, sustain: 0.4, release: 0.3 },
      }).toDestination();
      synthRef.current.volume.value = -6;
    }
    return synthRef.current;
  }, []);

  const play = useCallback(async () => {
    // Ensure AudioContext is running (required by browsers on user gesture)
    await Tone.start();

    const synth = getSynth();
    const { project } = useProjectStore.getState();
    const { activeClipId, playheadTick, setIsPlaying, setPlayheadTick } = useUiStore.getState();

    const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === activeClipId);
    if (!clip || clip.notes.length === 0) return;

    const bpm = project.tempoChanges[0]?.bpm ?? 120;
    const tpb = project.ticksPerBeat;

    // Reset transport
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    transport.bpm.value = bpm;
    transport.position = 0;

    startTickRef.current = playheadTick;
    const startOffset = tickToSeconds(playheadTick, bpm, tpb);

    // Schedule all notes
    for (const note of clip.notes) {
      const noteStartSec = tickToSeconds(note.startTick, bpm, tpb) - startOffset;
      const noteDurSec = Math.max(0.05, tickToSeconds(note.duration, bpm, tpb));
      if (noteStartSec < 0) continue;

      const freq = Tone.Frequency(note.pitch, 'midi').toFrequency();
      const vel = Math.max(0.01, note.velocity / 127);

      // The `time` param from schedule() is the precise AudioContext time — pass it through
      transport.schedule((time) => {
        synth.triggerAttackRelease(freq, noteDurSec, time, vel);
      }, noteStartSec);
    }

    transport.start();
    isPlayingRef.current = true;
    setIsPlaying(true);

    // Animate playhead
    const startTime = Tone.now();
    const tick = () => {
      if (!isPlayingRef.current) return;
      const elapsed = Tone.now() - startTime;
      const currentTick = startTickRef.current + (elapsed / 60) * bpm * tpb;
      setPlayheadTick(Math.round(currentTick));
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, [getSynth]);

  const stop = useCallback(() => {
    isPlayingRef.current = false;
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    cancelAnimationFrame(animRef.current);
    useUiStore.getState().setIsPlaying(false);
  }, []);

  const togglePlayback = useCallback(() => {
    if (isPlayingRef.current) {
      stop();
    } else {
      play();
    }
  }, [play, stop]);

  useEffect(() => {
    return () => {
      isPlayingRef.current = false;
      cancelAnimationFrame(animRef.current);
      synthRef.current?.dispose();
    };
  }, []);

  return { play, stop, togglePlayback };
}
