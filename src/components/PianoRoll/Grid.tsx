import React, { useRef, useEffect } from 'react';
import { pitchClass } from '../../utils/music';

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

interface GridProps {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  pixelsPerTick: number;
  pixelsPerSemitone: number;
  ticksPerBeat: number;
  numerator: number;
  denominator: number;
  snapDivision: number;
}

export const Grid: React.FC<GridProps> = ({
  width,
  height,
  scrollX,
  scrollY,
  pixelsPerTick,
  pixelsPerSemitone,
  ticksPerBeat,
  numerator,
  denominator,
  snapDivision,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // -- Logic Pro style: alternating row backgrounds --
    const visiblePitches = Math.ceil(height / pixelsPerSemitone) + 2;
    for (let i = -1; i <= visiblePitches; i++) {
      const pitch = Math.floor(scrollY) + i;
      if (pitch < 0 || pitch > 127) continue;
      const yOffset = scrollY - Math.floor(scrollY);
      const y = height - (pitch - Math.floor(scrollY) + 1) * pixelsPerSemitone + yOffset * pixelsPerSemitone;
      const isBlack = BLACK_KEYS.has(pitchClass(pitch));

      // Logic Pro: white-key rows slightly lighter, black-key rows darker
      ctx.fillStyle = isBlack ? '#2a2a2a' : '#323232';
      ctx.fillRect(0, y, width, pixelsPerSemitone);
    }

    // -- Horizontal pitch lines --
    // Logic Pro: strong lines at B/C boundary (octave) and E/F boundary
    for (let i = -1; i <= visiblePitches; i++) {
      const pitch = Math.floor(scrollY) + i;
      if (pitch < 0 || pitch > 127) continue;
      const yOffset = scrollY - Math.floor(scrollY);
      const y = height - (pitch - Math.floor(scrollY) + 1) * pixelsPerSemitone + yOffset * pixelsPerSemitone;
      const pc = pitchClass(pitch);

      // Strong line at C (octave boundary) and E (E/F boundary)
      if (pc === 0) {
        // Octave boundary: C note bottom edge
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1.5;
      } else if (pc === 5) {
        // E/F boundary
        ctx.strokeStyle = '#222222';
        ctx.lineWidth = 1;
      } else {
        // Regular pitch line — very subtle
        ctx.strokeStyle = '#2e2e2e';
        ctx.lineWidth = 0.5;
      }
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y + pixelsPerSemitone) + 0.5);
      ctx.lineTo(width, Math.round(y + pixelsPerSemitone) + 0.5);
      ctx.stroke();
    }

    // -- Vertical lines: subdivisions, beats, bars --
    const ticksPerBar = ticksPerBeat * numerator * (4 / denominator);
    // snapDivision=1 means whole note grid. For non-4/4, "whole note" = one measure.
    // snapDivision=N means N subdivisions per beat (quarter note base).
    const snapTicks = snapDivision <= 1
      ? ticksPerBar  // 1/1 snap = one measure, regardless of time signature
      : (ticksPerBeat * 4) / snapDivision;
    // Always draw at least every beat for visual reference
    const drawStep = Math.min(snapTicks, ticksPerBeat);
    const startTick = Math.floor(scrollX / drawStep) * drawStep;
    const endTick = scrollX + width / pixelsPerTick;

    for (let tick = startTick; tick <= endTick; tick += drawStep) {
      const x = Math.round((tick - scrollX) * pixelsPerTick) + 0.5;
      const isBar = Math.abs(tick % ticksPerBar) < 0.5;
      const isBeat = Math.abs(tick % ticksPerBeat) < 0.5;

      if (isBar) {
        // Bar line: solid dark black
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 1.5;
      } else if (isBeat) {
        // Beat line: dark
        ctx.strokeStyle = '#1e1e1e';
        ctx.lineWidth = 1;
      } else {
        // Subdivision: light grey dotted feel
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 0.5;
      }

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }, [width, height, scrollX, scrollY, pixelsPerTick, pixelsPerSemitone, ticksPerBeat, numerator, denominator, snapDivision]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', top: 0, left: 0, width, height }}
    />
  );
};
