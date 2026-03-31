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

/**
 * Snap a tick to the nearest grid position.
 *
 * When ticksPerBar is provided, snap points reset at every bar line.
 * This handles odd time signatures (5/4, 7/8, etc.) where snapTicks
 * doesn't evenly divide the bar length — without this, snap points
 * would drift across bar boundaries and miss downbeats.
 */
export function snapTick(tick: number, snapTicks: number, ticksPerBar?: number): number {
  if (!ticksPerBar || snapTicks <= 0) {
    // Simple global snap (backwards compatible, works for 4/4 and even divisions)
    return Math.round(tick / snapTicks) * snapTicks;
  }

  // Which bar are we in?
  const bar = Math.floor(tick / ticksPerBar);
  const barStart = bar * ticksPerBar;
  const posInBar = tick - barStart;

  // Snap within the bar
  const snappedInBar = Math.round(posInBar / snapTicks) * snapTicks;

  // If snapped position >= bar length, clamp to bar start of next bar
  if (snappedInBar >= ticksPerBar) {
    return (bar + 1) * ticksPerBar;
  }

  return barStart + snappedInBar;
}

export function getSnapTicksFromDivision(
  division: number,
  ticksPerBeat: number,
  numerator: number = 4,
  denominator: number = 4,
): number {
  // division is note denominator: 1=whole, 2=half, 4=quarter, 8=eighth, etc.
  if (division <= 1) {
    // Whole note snap = one full measure, respects time signature
    return ticksPerBeat * numerator * (4 / denominator);
  }
  return (ticksPerBeat * 4) / division;
}

/**
 * Smart snap: pick the finest grid subdivision where grid lines are >= minPx apart.
 * Hierarchy: 1/32 → 1/16 → 1/8 → 1/4 → 1/2 → 1/1 (whole bar).
 */
const SMART_DIVISIONS = [32, 16, 8, 4, 2, 1] as const;
const SMART_MIN_PX = 20; // minimum pixels between grid lines

export function getSmartSnapTicks(
  pixelsPerTick: number,
  ticksPerBeat: number,
  numerator: number = 4,
  denominator: number = 4,
): number {
  for (const div of SMART_DIVISIONS) {
    const ticks = div <= 1
      ? ticksPerBeat * numerator * (4 / denominator)
      : (ticksPerBeat * 4) / div;
    const px = ticks * pixelsPerTick;
    if (px >= SMART_MIN_PX) return ticks;
  }
  // Fallback: whole bar
  return ticksPerBeat * numerator * (4 / denominator);
}

export function tickToSeconds(tick: number, bpm: number, ticksPerBeat: number): number {
  return (tick / ticksPerBeat) * (60 / bpm);
}

export function secondsToTick(seconds: number, bpm: number, ticksPerBeat: number): number {
  return (seconds / 60) * bpm * ticksPerBeat;
}
