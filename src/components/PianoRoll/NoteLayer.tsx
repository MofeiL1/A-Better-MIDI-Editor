import React, { useRef, useEffect } from 'react';
import type { Note } from '../../types/model';
import { isInScale, pitchClass } from '../../utils/music';

interface NoteLayerProps {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  pixelsPerTick: number;
  pixelsPerSemitone: number;
  notes: Note[];
  selectedNoteIds: Set<string>;
  scaleRoot: number;
  scaleMode: string;
  onMouseDown?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

function velocityToColor(velocity: number, selected: boolean, inScale: boolean): string {
  const v = velocity / 127;
  if (selected) {
    // Warm gold for selected — Apple accent feel
    const l = 50 + v * 15;
    return `hsl(42, 85%, ${l}%)`;
  }
  if (!inScale) {
    // Muted rose for out-of-scale
    return `hsla(350, 50%, ${35 + v * 15}%, 0.85)`;
  }
  // Cool blue — velocity maps brightness
  const h = 210 + v * 10;
  const s = 55 + v * 15;
  const l = 40 + v * 20;
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export const NoteLayer: React.FC<NoteLayerProps> = ({
  width,
  height,
  scrollX,
  scrollY,
  pixelsPerTick,
  pixelsPerSemitone,
  notes,
  selectedNoteIds,
  scaleRoot,
  scaleMode,
  onMouseDown,
  onMouseMove,
  onMouseUp,
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

    const minVisibleTick = scrollX;
    const maxVisibleTick = scrollX + width / pixelsPerTick;
    const minVisiblePitch = scrollY - 1;
    const maxVisiblePitch = scrollY + Math.ceil(height / pixelsPerSemitone) + 1;

    for (const note of notes) {
      const noteEnd = note.startTick + note.duration;
      if (noteEnd < minVisibleTick || note.startTick > maxVisibleTick) continue;
      if (note.pitch < minVisiblePitch || note.pitch > maxVisiblePitch) continue;

      const x = (note.startTick - scrollX) * pixelsPerTick;
      const w = note.duration * pixelsPerTick;
      const y = height - (note.pitch - scrollY + 1) * pixelsPerSemitone;
      const h = pixelsPerSemitone;

      const selected = selectedNoteIds.has(note.id);
      const inScale = isInScale(note.pitch, scaleRoot, scaleMode);
      const color = velocityToColor(note.velocity, selected, inScale);

      // Note body with rounded corners
      const radius = Math.min(4, h / 3, w / 3);
      const noteX = x + 0.5;
      const noteY = y + 1;
      const noteW = Math.max(w - 1, 3);
      const noteH = h - 2;

      ctx.beginPath();
      ctx.roundRect(noteX, noteY, noteW, noteH, radius);
      ctx.fillStyle = color;
      ctx.fill();

      // Subtle inner highlight (top edge glow)
      const grad = ctx.createLinearGradient(noteX, noteY, noteX, noteY + noteH);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
      grad.addColorStop(0.3, 'rgba(255, 255, 255, 0)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Selection border
      if (selected) {
        ctx.strokeStyle = 'rgba(255, 215, 100, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Resize handle
      if (noteW > 10) {
        ctx.fillStyle = selected ? 'rgba(255, 255, 220, 0.25)' : 'rgba(255, 255, 255, 0.08)';
        const handleW = Math.min(4, noteW * 0.15);
        ctx.beginPath();
        ctx.roundRect(noteX + noteW - handleW - 1, noteY + 2, handleW, noteH - 4, 1);
        ctx.fill();
      }

      // Note name
      if (noteW > 28 && noteH >= 12) {
        ctx.fillStyle = selected ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.7)';
        ctx.font = `500 ${Math.min(10, noteH - 4)}px Inter, -apple-system, sans-serif`;
        const name = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][pitchClass(note.pitch)];
        ctx.fillText(name, noteX + 4, noteY + noteH - 3);
      }
    }
  }, [width, height, scrollX, scrollY, pixelsPerTick, pixelsPerSemitone, notes, selectedNoteIds, scaleRoot, scaleMode]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', top: 0, left: 0, width, height, cursor: 'crosshair' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    />
  );
};
