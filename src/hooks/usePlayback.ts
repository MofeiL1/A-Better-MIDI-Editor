import { useRef, useCallback, useEffect } from 'react';
import * as Tone from 'tone';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';
import { tickToSeconds } from '../utils/timing';
import { getPianoSampler, getSamplerSync } from '../audio/pianoSampler';

export function usePlayback() {
  const animRef = useRef<number>(0);
  const startTickRef = useRef(0);
  const isPlayingRef = useRef(false);

  const play = useCallback(async () => {
    await Tone.start();

    const { project } = useProjectStore.getState();
    const { activeClipId, playheadTick, setIsPlaying, setPlayheadTick, audioLatency } = useUiStore.getState();

    const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === activeClipId);
    if (!clip || clip.notes.length === 0) return;

    const sampler = await getPianoSampler();

    const ctx = Tone.getContext();
    ctx.lookAhead = audioLatency;
    (ctx as unknown as Record<string, unknown>).updateInterval = Math.max(0.01, audioLatency / 2);

    const bpm = project.tempoChanges[0]?.bpm ?? 120;
    const tpb = project.ticksPerBeat;

    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    transport.bpm.value = bpm;
    transport.position = 0;

    startTickRef.current = playheadTick;
    const startOffset = tickToSeconds(playheadTick, bpm, tpb);

    for (const note of clip.notes) {
      const noteStartSec = tickToSeconds(note.startTick, bpm, tpb) - startOffset;
      const noteDurSec = Math.max(0.05, tickToSeconds(note.duration, bpm, tpb));
      if (noteStartSec < 0) continue;

      const noteName = Tone.Frequency(note.pitch, 'midi').toNote();
      const vel = Math.max(0.01, note.velocity / 127);

      // Attack and Release scheduled separately so:
      // - transport.cancel() can cancel future releases
      // - releaseAll() can find active notes in _activeSources
      transport.schedule((time) => {
        sampler.triggerAttack(noteName, time, vel);
      }, noteStartSec);
      transport.schedule((time) => {
        sampler.triggerRelease(noteName, time);
      }, noteStartSec + noteDurSec);
    }

    transport.start();
    isPlayingRef.current = true;
    setIsPlaying(true);

    const startTime = Tone.now();
    const tick = () => {
      if (!isPlayingRef.current) return;
      const elapsed = Tone.now() - startTime;
      const currentTick = startTickRef.current + (elapsed / 60) * bpm * tpb;
      setPlayheadTick(Math.round(currentTick));
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, []);

  const stop = useCallback(() => {
    isPlayingRef.current = false;
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    cancelAnimationFrame(animRef.current);
    // MIDI Note Off: release all voices with natural decay
    const sampler = getSamplerSync();
    if (sampler) sampler.releaseAll();
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
    };
  }, []);

  return { play, stop, togglePlayback };
}
