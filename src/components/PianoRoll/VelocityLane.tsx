import React, { useRef, useEffect, useCallback } from 'react';
import type { Note } from '../../types/model';

interface VelocityLaneProps {
  width: number;
  height: number;
  scrollX: number;
  pixelsPerTick: number;
  notes: Note[];
  selectedNoteIds: Set<string>;
  onVelocityChange?: (noteId: string, velocity: number) => void;
}

export const VelocityLane: React.FC<VelocityLaneProps> = ({
  width,
  height,
  scrollX,
  pixelsPerTick,
  notes,
  selectedNoteIds,
  onVelocityChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#141416';
    ctx.fillRect(0, 0, width, height);

    // Guide lines
    for (const v of [32, 64, 96]) {
      const y = height - (v / 127) * (height - 8);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const minVisibleTick = scrollX;
    const maxVisibleTick = scrollX + width / pixelsPerTick;

    for (const note of notes) {
      if (note.startTick + note.duration < minVisibleTick || note.startTick > maxVisibleTick) continue;

      const x = (note.startTick - scrollX) * pixelsPerTick;
      const barH = (note.velocity / 127) * (height - 8);
      const barW = Math.max(note.duration * pixelsPerTick - 2, 3);
      const selected = selectedNoteIds.has(note.id);

      const v = note.velocity / 127;
      const hue = selected ? 42 : 210 + v * 10;
      const sat = selected ? 85 : 55 + v * 15;
      const lig = selected ? 55 : 40 + v * 18;

      // Bar with rounded top
      ctx.beginPath();
      ctx.roundRect(x + 0.5, height - barH, barW, barH, [3, 3, 0, 0]);
      ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lig}%)`;
      ctx.fill();

      // Top glow
      const grad = ctx.createLinearGradient(x, height - barH, x, height - barH + 6);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Value label
      if (barW > 16) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '500 9px Inter, -apple-system, sans-serif';
        ctx.fillText(String(note.velocity), x + 2, height - barH - 3);
      }
    }
  }, [width, height, scrollX, pixelsPerTick, notes, selectedNoteIds]);

  const handleVelocityEdit = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const velocity = Math.round(Math.max(1, Math.min(127, ((height - my) / height) * 127)));

    for (const note of notes) {
      const x = (note.startTick - scrollX) * pixelsPerTick;
      const w = Math.max(note.duration * pixelsPerTick, 3);
      if (mx >= x && mx <= x + w) {
        onVelocityChange?.(note.id, velocity);
        break;
      }
    }
  }, [scrollX, pixelsPerTick, notes, height, onVelocityChange]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        cursor: 'ns-resize',
        borderTop: '1px solid rgba(255, 255, 255, 0.04)',
      }}
      onMouseDown={(e) => { isDragging.current = true; handleVelocityEdit(e); }}
      onMouseMove={(e) => { if (isDragging.current) handleVelocityEdit(e); }}
      onMouseUp={() => { isDragging.current = false; }}
      onMouseLeave={() => { isDragging.current = false; }}
    />
  );
};
