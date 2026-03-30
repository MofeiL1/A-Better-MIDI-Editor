import React, { useRef, useEffect, useCallback } from 'react';
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
    return `hsl(45, 90%, ${40 + v * 30}%)`;
  }
  if (!inScale) {
    return `hsl(0, 60%, ${30 + v * 25}%)`;
  }
  // Blue-to-cyan gradient based on velocity
  return `hsl(${200 + v * 20}, ${60 + v * 20}%, ${35 + v * 25}%)`;
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
      // Cull invisible notes
      const noteEnd = note.startTick + note.duration;
      if (noteEnd < minVisibleTick || note.startTick > maxVisibleTick) continue;
      if (note.pitch < minVisiblePitch || note.pitch > maxVisiblePitch) continue;

      const x = (note.startTick - scrollX) * pixelsPerTick;
      const w = note.duration * pixelsPerTick;
      const y = height - (note.pitch - scrollY + 1) * pixelsPerSemitone;
      const h = pixelsPerSemitone;

      const selected = selectedNoteIds.has(note.id);
      const inScale = isInScale(note.pitch, scaleRoot, scaleMode);

      // Note body
      ctx.fillStyle = velocityToColor(note.velocity, selected, inScale);
      const radius = Math.min(3, h / 3);
      ctx.beginPath();
      ctx.roundRect(x + 0.5, y + 0.5, Math.max(w - 1, 2), h - 1, radius);
      ctx.fill();

      // Border
      if (selected) {
        ctx.strokeStyle = '#ffdd88';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Resize handle (right edge)
      if (w > 8) {
        ctx.fillStyle = selected ? 'rgba(255,255,200,0.4)' : 'rgba(255,255,255,0.15)';
        ctx.fillRect(x + w - 5, y + 1, 4, h - 2);
      }

      // Note name label for wide enough notes
      if (w > 30 && h >= 12) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = `${Math.min(10, h - 3)}px monospace`;
        const noteName = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][pitchClass(note.pitch)];
        ctx.fillText(noteName, x + 3, y + h - 3);
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
