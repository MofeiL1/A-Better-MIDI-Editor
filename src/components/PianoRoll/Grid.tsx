import React, { useRef, useEffect } from 'react';
import { isInScale, isRoot, pitchClass } from '../../utils/music';

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
  scaleRoot: number;
  scaleMode: string;
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
  scaleRoot,
  scaleMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    // Draw pitch row backgrounds
    const visiblePitches = Math.ceil(height / pixelsPerSemitone) + 2;
    for (let i = -1; i <= visiblePitches; i++) {
      const pitch = scrollY + i;
      if (pitch < 0 || pitch > 127) continue;
      const y = height - (pitch - scrollY + 1) * pixelsPerSemitone;
      const isBlack = BLACK_KEYS.has(pitchClass(pitch));
      const inScale = isInScale(pitch, scaleRoot, scaleMode);
      const rootNote = isRoot(pitch, scaleRoot);

      if (rootNote) {
        ctx.fillStyle = 'rgba(255, 180, 50, 0.08)';
      } else if (inScale) {
        ctx.fillStyle = isBlack ? 'rgba(100, 200, 100, 0.03)' : 'rgba(100, 200, 100, 0.06)';
      } else {
        ctx.fillStyle = isBlack ? '#1a1a1a' : '#222222';
      }
      ctx.fillRect(0, y, width, pixelsPerSemitone);
    }

    // Draw horizontal pitch lines
    for (let i = -1; i <= visiblePitches; i++) {
      const pitch = scrollY + i;
      const y = height - (pitch - scrollY + 1) * pixelsPerSemitone;
      ctx.strokeStyle = pitchClass(pitch) === 0 ? '#555' : '#333';
      ctx.lineWidth = pitchClass(pitch) === 0 ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + pixelsPerSemitone);
      ctx.lineTo(width, y + pixelsPerSemitone);
      ctx.stroke();
    }

    // Draw vertical beat/bar lines
    const ticksPerBar = ticksPerBeat * numerator;
    const startTick = Math.floor(scrollX / ticksPerBeat) * ticksPerBeat;
    const endTick = scrollX + width / pixelsPerTick;

    for (let tick = startTick; tick <= endTick; tick += ticksPerBeat) {
      const x = (tick - scrollX) * pixelsPerTick;
      const isBar = tick % ticksPerBar === 0;
      ctx.strokeStyle = isBar ? '#555' : '#333';
      ctx.lineWidth = isBar ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Bar number
      if (isBar) {
        const barNum = Math.floor(tick / ticksPerBar) + 1;
        ctx.fillStyle = '#666';
        ctx.font = '10px monospace';
        ctx.fillText(String(barNum), x + 3, 12);
      }
    }
  }, [width, height, scrollX, scrollY, pixelsPerTick, pixelsPerSemitone, ticksPerBeat, numerator, scaleRoot, scaleMode]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', top: 0, left: 0, width, height }}
    />
  );
};
