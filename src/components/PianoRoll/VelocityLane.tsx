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

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Horizontal guide lines
    for (const v of [32, 64, 96]) {
      const y = height - (v / 127) * height;
      ctx.strokeStyle = '#333';
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
      const barH = (note.velocity / 127) * (height - 4);
      const barW = Math.max(note.duration * pixelsPerTick - 1, 3);
      const selected = selectedNoteIds.has(note.id);

      // Velocity bar
      const hue = 200 + (note.velocity / 127) * 20;
      ctx.fillStyle = selected ? `hsl(45, 90%, 55%)` : `hsl(${hue}, 70%, 50%)`;
      ctx.fillRect(x, height - barH, barW, barH);

      // Velocity value on top
      if (barW > 14) {
        ctx.fillStyle = '#ddd';
        ctx.font = '9px monospace';
        ctx.fillText(String(note.velocity), x + 1, height - barH - 2);
      }
    }
  }, [width, height, scrollX, pixelsPerTick, notes, selectedNoteIds]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = true;
    handleVelocityEdit(e);
  }, [scrollX, pixelsPerTick, notes, height, onVelocityChange]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging.current) return;
    handleVelocityEdit(e);
  }, [scrollX, pixelsPerTick, notes, height, onVelocityChange]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  function handleVelocityEdit(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const velocity = Math.round(Math.max(1, Math.min(127, ((height - my) / height) * 127)));

    // Find note under cursor
    for (const note of notes) {
      const x = (note.startTick - scrollX) * pixelsPerTick;
      const w = Math.max(note.duration * pixelsPerTick, 3);
      if (mx >= x && mx <= x + w) {
        onVelocityChange?.(note.id, velocity);
        break;
      }
    }
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, cursor: 'ns-resize', borderTop: '1px solid #444' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
};
