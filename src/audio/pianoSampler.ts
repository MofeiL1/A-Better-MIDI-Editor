import * as Tone from 'tone';

/**
 * Singleton Salamander Grand Piano sampler.
 * Loaded once and shared by both playback and preview.
 */

const SAMPLE_URLS: Record<string, string> = {
  A0: 'A0.mp3',   C1: 'C1.mp3',   'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
  A1: 'A1.mp3',   C2: 'C2.mp3',   'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
  A2: 'A2.mp3',   C3: 'C3.mp3',   'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
  A3: 'A3.mp3',   C4: 'C4.mp3',   'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
  A4: 'A4.mp3',   C5: 'C5.mp3',   'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
  A5: 'A5.mp3',   C6: 'C6.mp3',   'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
  A6: 'A6.mp3',   C7: 'C7.mp3',   'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
  A7: 'A7.mp3',   C8: 'C8.mp3',
};

let sampler: Tone.Sampler | null = null;
let loadPromise: Promise<Tone.Sampler> | null = null;
const readyCallbacks: Array<() => void> = [];

function notifyReady() {
  readyCallbacks.forEach((cb) => cb());
  readyCallbacks.length = 0;
}

export function getPianoSampler(): Promise<Tone.Sampler> {
  if (sampler?.loaded) return Promise.resolve(sampler);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    sampler = new Tone.Sampler({
      urls: SAMPLE_URLS,
      release: 0.08,
      baseUrl: 'https://tonejs.github.io/audio/salamander/',
      onload: () => {
        notifyReady();
        resolve(sampler!);
      },
    }).toDestination();
    sampler.volume.value = -6;
  });

  return loadPromise;
}

/** Returns the sampler if already loaded, null otherwise. */
export function getSamplerSync(): Tone.Sampler | null {
  return sampler?.loaded ? sampler : null;
}

/** Register a callback to be called when the sampler finishes loading. */
export function onSamplerReady(cb: () => void) {
  if (sampler?.loaded) { cb(); return; }
  readyCallbacks.push(cb);
}

/** Kick off loading immediately (call early, don't wait for first play). */
export function preloadPianoSampler() {
  getPianoSampler();
}
