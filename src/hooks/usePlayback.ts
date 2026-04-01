import { useRef, useCallback, useEffect } from 'react';
import * as Tone from 'tone';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';
import { tickToSeconds } from '../utils/timing';
import { getEffectiveDuration } from '../utils/noteDuration';
import { getPianoSampler, getSamplerSync } from '../audio/pianoSampler';

// Module-level state: shared across all usePlayback() instances
let animFrame = 0;
let startTick = 0;
let playGeneration = 0; // incremented on each stop, lets async play() detect cancellation

function forceStop() {
  playGeneration++;
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
  cancelAnimationFrame(animFrame);
  const sampler = getSamplerSync();
  if (sampler) sampler.releaseAll();
  useUiStore.getState().setIsPlaying(false);
}

export function usePlayback() {
  // Keep a local ref to clean up animation on unmount
  const mountedRef = useRef(true);

  const stop = useCallback(() => {
    forceStop();
  }, []);

  const play = useCallback(async () => {
    // If already playing, stop first
    if (useUiStore.getState().isPlaying) {
      forceStop();
    }

    const gen = ++playGeneration; // claim a generation

    await Tone.start();
    if (gen !== playGeneration) return; // cancelled during await

    const { project } = useProjectStore.getState();
    const { activeClipId, playheadTick, setIsPlaying, setPlayheadTick, audioLatency } = useUiStore.getState();

    const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === activeClipId);
    if (!clip || clip.notes.length === 0) return;

    const sampler = await getPianoSampler();
    if (gen !== playGeneration) return; // cancelled during await

    const ctx = Tone.getContext();
    ctx.lookAhead = audioLatency;
    (ctx as unknown as Record<string, unknown>).updateInterval = Math.max(0.01, audioLatency / 2);

    const bpm = project.tempoChanges[0]?.bpm ?? 120;
    const tpb = project.ticksPerBeat;
    const ts = project.timeSignatureChanges[0] ?? { numerator: 4, denominator: 4 };
    const ticksPerMeasure = tpb * ts.numerator * (4 / ts.denominator);

    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    transport.bpm.value = bpm;
    transport.position = 0;

    startTick = playheadTick;
    const startOffset = tickToSeconds(playheadTick, bpm, tpb);

    for (const note of clip.notes) {
      const noteStartSec = tickToSeconds(note.startTick, bpm, tpb) - startOffset;
      const effectiveDur = getEffectiveDuration(note, clip.notes, ticksPerMeasure);
      const noteDurSec = Math.max(0.05, tickToSeconds(effectiveDur, bpm, tpb));
      if (noteStartSec < 0) continue;

      const noteName = Tone.Frequency(note.pitch, 'midi').toNote();
      const vel = Math.max(0.01, note.velocity / 127);

      transport.schedule((time) => {
        sampler.triggerAttack(noteName, time, vel);
      }, noteStartSec);
      transport.schedule((time) => {
        sampler.triggerRelease(noteName, time);
      }, noteStartSec + noteDurSec);
    }

    transport.start();
    setIsPlaying(true);

    const startTime = Tone.now();
    const tick = () => {
      if (gen !== playGeneration) return; // stop was called
      const elapsed = Tone.now() - startTime;
      const currentTick = startTick + (elapsed / 60) * bpm * tpb;
      setPlayheadTick(Math.round(currentTick));
      animFrame = requestAnimationFrame(tick);
    };
    animFrame = requestAnimationFrame(tick);
  }, []);

  const togglePlayback = useCallback(() => {
    if (useUiStore.getState().isPlaying) {
      stop();
    } else {
      play();
    }
  }, [play, stop]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(animFrame);
    };
  }, []);

  return { play, stop, togglePlayback };
}
