import React, { useRef, useEffect, useCallback } from 'react';
import { snapTick } from '../../utils/timing';

interface RulerProps {
  width: number;
  height: number;
  scrollX: number;
  pixelsPerTick: number;
  ticksPerBeat: number;
  numerator: number;
  playheadTick: number;
  snapTicks: number;
  onSetPlayhead?: (tick: number) => void;
}

const RULER_HEIGHT = 22;

export { RULER_HEIGHT };

export const Ruler: React.FC<RulerProps> = ({
  width,
  height,
  scrollX,
  pixelsPerTick,
  ticksPerBeat,
  numerator,
  playheadTick,
  snapTicks,
  onSetPlayhead,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDragging = useRef(false);
  const canvasLeft = useRef(0);

  const tickFromClientX = useCallback((clientX: number) => {
    const raw = (clientX - canvasLeft.current) / pixelsPerTick + scrollX;
    return Math.max(0, snapTick(raw, snapTicks));
  }, [pixelsPerTick, scrollX, snapTicks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(width, height - 0.5);
    ctx.stroke();

    const ticksPerBar = ticksPerBeat * numerator;
    const startTick = Math.floor(scrollX / ticksPerBeat) * ticksPerBeat;
    const endTick = scrollX + width / pixelsPerTick;

    ctx.font = '500 10px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif';

    for (let tick = startTick; tick <= endTick; tick += ticksPerBeat) {
      const x = (tick - scrollX) * pixelsPerTick;
      const isBar = tick % ticksPerBar === 0;

      if (isBar) {
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, height - 12);
        ctx.lineTo(Math.round(x) + 0.5, height);
        ctx.stroke();

        const barNum = Math.floor(tick / ticksPerBar) + 1;
        ctx.fillStyle = '#999';
        ctx.fillText(String(barNum), x + 4, 13);
      } else {
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, height - 6);
        ctx.lineTo(Math.round(x) + 0.5, height);
        ctx.stroke();
      }
    }

    // Playhead triangle
    const phX = (playheadTick - scrollX) * pixelsPerTick;
    if (phX >= 0 && phX <= width) {
      ctx.fillStyle = '#e0e0e0';
      ctx.beginPath();
      ctx.moveTo(phX - 5, 0);
      ctx.lineTo(phX + 5, 0);
      ctx.lineTo(phX + 5, 8);
      ctx.lineTo(phX, 14);
      ctx.lineTo(phX - 5, 8);
      ctx.closePath();
      ctx.fill();
    }
  }, [width, height, scrollX, pixelsPerTick, ticksPerBeat, numerator, playheadTick]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    isDragging.current = true;
    canvasLeft.current = e.currentTarget.getBoundingClientRect().left;
    onSetPlayhead?.(tickFromClientX(e.clientX));

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      onSetPlayhead?.(tickFromClientX(ev.clientX));
    };
    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [tickFromClientX, onSetPlayhead]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, cursor: 'col-resize', display: 'block' }}
      onMouseDown={handleMouseDown}
    />
  );
};
