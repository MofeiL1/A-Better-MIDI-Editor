/**
 * Tick ↔ pixel conversions and snap-to-grid utilities.
 */

export function tickToPixel(tick: number, pixelsPerTick: number, scrollX: number): number {
  return (tick - scrollX) * pixelsPerTick;
}

export function pixelToTick(px: number, pixelsPerTick: number, scrollX: number): number {
  return px / pixelsPerTick + scrollX;
}

export function pitchToY(pitch: number, pixelsPerSemitone: number, scrollY: number, canvasHeight: number): number {
  // Higher pitches at the top. pitch 127 = top, pitch 0 = bottom
  return canvasHeight - (pitch - scrollY + 1) * pixelsPerSemitone;
}

export function yToPitch(y: number, pixelsPerSemitone: number, scrollY: number, canvasHeight: number): number {
  return Math.floor((canvasHeight - y) / pixelsPerSemitone + scrollY);
}

export function snapTick(tick: number, snapTicks: number): number {
  return Math.round(tick / snapTicks) * snapTicks;
}

export function getSnapTicksFromDivision(division: number, ticksPerBeat: number): number {
  return ticksPerBeat / division;
}

export function tickToSeconds(tick: number, bpm: number, ticksPerBeat: number): number {
  return (tick / ticksPerBeat) * (60 / bpm);
}

export function secondsToTick(seconds: number, bpm: number, ticksPerBeat: number): number {
  return (seconds / 60) * bpm * ticksPerBeat;
}
