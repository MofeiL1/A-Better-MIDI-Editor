import React, { useRef, useEffect } from 'react';
import type { Note } from '../../types/model';
import { pitchClass } from '../../utils/music';
import { useUiStore } from '../../store/uiStore';

interface NoteLayerProps {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  pixelsPerTick: number;
  pixelsPerSemitone: number;
  notes: Note[];
  selectedNoteIds: Set<string>;
  /** Ghost notes shown during drag at original positions */
  ghostNotes?: { pitch: number; startTick: number; duration: number; velocity: number }[];
  /** If true, ghost notes look like real notes (semi-transparent) for copy mode */
  ghostCopyMode?: boolean;
  cursor?: string;
  onMouseDown?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

// Logic Pro velocity color: purple(low) → blue → green → yellow → orange → red(high)
function velocityToHue(velocity: number): number {
  const v = velocity / 127;
  return 270 - v * 270;
}

function noteColor(velocity: number, selected: boolean, hovered: boolean): string {
  const hue = velocityToHue(velocity);
  const v = velocity / 127;
  if (selected) {
    return `hsl(${hue}, 85%, 68%)`;
  }
  if (hovered) {
    return `hsl(${hue}, 70%, ${38 + v * 18}%)`;
  }
  return `hsl(${hue}, 65%, ${30 + v * 18}%)`;
}

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export const NoteLayer: React.FC<NoteLayerProps> = ({
  width,
  height,
  scrollX,
  scrollY,
  pixelsPerTick,
  pixelsPerSemitone,
  notes,
  selectedNoteIds,
  ghostNotes,
  ghostCopyMode,
  cursor = 'crosshair',
  onMouseDown,
  onMouseMove,
  onMouseLeave,
}) => {
  const velocityDragNoteId = useUiStore((s) => s.velocityDragNoteId);
  const hoveredNoteId = useUiStore((s) => s.hoveredNoteId);
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

    const minVisibleTick = scrollX;
    const maxVisibleTick = scrollX + width / pixelsPerTick;
    const minVisiblePitch = scrollY - 1;
    const maxVisiblePitch = scrollY + Math.ceil(height / pixelsPerSemitone) + 1;

    // Draw unselected notes first, then selected on top
    const unselected: Note[] = [];
    const selected: Note[] = [];
    for (const note of notes) {
      const noteEnd = note.startTick + note.duration;
      if (noteEnd < minVisibleTick || note.startTick > maxVisibleTick) continue;
      if (note.pitch < minVisiblePitch || note.pitch > maxVisiblePitch) continue;
      if (selectedNoteIds.has(note.id)) {
        selected.push(note);
      } else {
        unselected.push(note);
      }
    }

    const activeHighlightId = velocityDragNoteId || hoveredNoteId;

    const drawNote = (note: Note, isSelected: boolean) => {
      const x = (note.startTick - scrollX) * pixelsPerTick;
      const w = note.duration * pixelsPerTick;
      const y = height - (note.pitch - scrollY + 1) * pixelsPerSemitone;
      const h = pixelsPerSemitone;
      const isHovered = note.id === activeHighlightId;

      const color = noteColor(note.velocity, isSelected, isHovered);

      // Note body — Logic Pro style: rounded rect with 1px gap
      const noteX = x + 0.5;
      const noteY = y + 0.5;
      const noteW = Math.max(w - 1, 2);
      const noteH = Math.max(h - 1, 2);
      const radius = Math.min(2, noteH / 4, noteW / 4);

      ctx.beginPath();
      ctx.roundRect(noteX, noteY, noteW, noteH, radius);
      ctx.fillStyle = color;
      ctx.fill();

      // Top edge highlight — subtle 3D feel like Logic
      const grad = ctx.createLinearGradient(noteX, noteY, noteX, noteY + noteH);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
      grad.addColorStop(0.15, 'rgba(255, 255, 255, 0.03)');
      grad.addColorStop(0.85, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Velocity line inside note (Logic Pro signature)
      if (noteW > 6) {
        const velRatio = note.velocity / 127;
        const lineW = (noteW - 4) * velRatio;
        const lineY = noteY + noteH * 0.65;
        ctx.strokeStyle = isSelected
          ? 'rgba(255, 255, 255, 0.5)'
          : 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(noteX + 2, lineY);
        ctx.lineTo(noteX + 2 + lineW, lineY);
        ctx.stroke();
      }

      // Border
      if (isSelected) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(noteX, noteY, noteW, noteH, radius);
        ctx.stroke();
      } else if (isHovered) {
        // Hover: lighter border, no glow — subtler than selected
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(noteX, noteY, noteW, noteH, radius);
        ctx.stroke();
      } else {
        // Subtle dark border for unselected (Logic Pro feel)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.roundRect(noteX, noteY, noteW, noteH, radius);
        ctx.stroke();
      }

      // Note name label (left side)
      if (noteW > 24 && noteH >= 11) {
        ctx.font = `500 ${Math.min(10, noteH - 3)}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;
        const name = NOTE_NAMES[pitchClass(note.pitch)];
        ctx.fillStyle = isSelected
          ? 'rgba(255, 255, 255, 0.9)'
          : 'rgba(255, 255, 255, 0.7)';
        ctx.fillText(name, noteX + 3, noteY + noteH * 0.45 + 1);
      }

    };

    // Ghost notes — drawn first so they appear behind real notes
    if (ghostNotes && ghostNotes.length > 0) {
      for (const g of ghostNotes) {
        const nx = (g.startTick - scrollX) * pixelsPerTick;
        const nw = g.duration * pixelsPerTick;
        const noteH = pixelsPerSemitone;
        const ny = height - (g.pitch - scrollY + 1) * noteH;
        if (nx + nw < 0 || nx > width || ny + noteH < 0 || ny > height) continue;

        if (ghostCopyMode) {
          // Copy mode: looks like a real note but semi-transparent
          const hue = velocityToHue(g.velocity);
          ctx.globalAlpha = 0.4;
          ctx.fillStyle = `hsl(${hue}, 65%, ${30 + (g.velocity / 127) * 18}%)`;
          ctx.beginPath();
          ctx.roundRect(nx, ny + 1, nw, noteH - 2, 3);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(nx, ny + 1, nw, noteH - 2, 3);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else {
          // Move mode: faint outline only
          ctx.fillStyle = 'rgba(100, 160, 255, 0.1)';
          ctx.strokeStyle = 'rgba(100, 160, 255, 0.25)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.roundRect(nx, ny + 1, nw, noteH - 2, 3);
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    for (const note of unselected) drawNote(note, false);
    for (const note of selected) drawNote(note, true);

  }, [width, height, scrollX, scrollY, pixelsPerTick, pixelsPerSemitone, notes, selectedNoteIds, velocityDragNoteId, hoveredNoteId, ghostNotes, ghostCopyMode]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', top: 0, left: 0, width, height, cursor }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    />
  );
};
