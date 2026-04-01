import React, { useRef, useEffect } from 'react';
import type { Note } from '../../types/model';
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
  /** Map from note ID to effective duration (for null-duration notes) */
  nullDurations?: Map<string, number>;
  /** Semi-transparent preview showing where a dot will be placed */
  dotPreview?: { tick: number; pitch: number } | null;
  /** Ghost notes shown during drag at original positions */
  ghostNotes?: { pitch: number; startTick: number; duration: number | null; velocity: number }[];
  /** If true, ghost notes look like real notes (semi-transparent) for copy mode */
  ghostCopyMode?: boolean;
  cursor?: string;
  onMouseDown?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
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

function noteColorRgba(velocity: number, selected: boolean, hovered: boolean, alpha: number): string {
  const hue = velocityToHue(velocity);
  const v = velocity / 127;
  let s: number, l: number;
  if (selected) { s = 85; l = 68; }
  else if (hovered) { s = 70; l = 38 + v * 18; }
  else { s = 65; l = 30 + v * 18; }
  return `hsla(${hue}, ${s}%, ${l}%, ${alpha})`;
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
  nullDurations,
  dotPreview,
  ghostNotes,
  ghostCopyMode,
  cursor = 'crosshair',
  onMouseDown,
  onMouseMove,
  onMouseLeave,
  onContextMenu,
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

    const activeHighlightId = velocityDragNoteId || hoveredNoteId;
    const headH = pixelsPerSemitone; // equilateral: side = track height
    const headW = headH * Math.sqrt(3) / 2; // equilateral triangle width
    const headR = Math.max(1, headH * 0.15); // visible rounded corners

    // Separate selected/unselected for draw order
    const unselected: Note[] = [];
    const selected: Note[] = [];
    for (const note of notes) {
      if (note.pitch < minVisiblePitch || note.pitch > maxVisiblePitch) continue;
      const effectiveDur = note.duration !== null
        ? note.duration
        : (nullDurations?.get(note.id) ?? 0);
      const noteEnd = note.startTick + effectiveDur;
      if (noteEnd < minVisibleTick || note.startTick > maxVisibleTick) continue;
      if (selectedNoteIds.has(note.id)) {
        selected.push(note);
      } else {
        unselected.push(note);
      }
    }

    const drawNote = (note: Note, isSelected: boolean) => {
      const cx = (note.startTick - scrollX) * pixelsPerTick;
      const cy = height - (note.pitch - scrollY + 0.5) * pixelsPerSemitone;
      const isHovered = note.id === activeHighlightId;
      const isNullDuration = note.duration === null;
      const effectiveDur = isNullDuration
        ? (nullDurations?.get(note.id) ?? 0)
        : note.duration!;
      const color = noteColor(note.velocity, isSelected, isHovered);

      // ─── Extension line (drawn first, triangle head covers the start) ─────────
      if (effectiveDur > 0) {
        const tailFullW = effectiveDur * pixelsPerTick;
        const tailH = pixelsPerSemitone * 0.6;
        const tailAlpha = isNullDuration ? 0.3 : 0.85;
        const tailColor = noteColorRgba(note.velocity, isSelected, isHovered, tailAlpha);

        ctx.fillStyle = tailColor;
        ctx.beginPath();
        ctx.roundRect(cx, cy - tailH / 2, tailFullW, tailH, tailH * 0.2);
        ctx.fill();
      }

      // ─── Triangle head (right-pointing, slight rounding) ──────────────────────
      const x0 = cx;
      const x1 = cx + headW;
      const yTop = cy - headH / 2;
      const yBot = cy + headH / 2;

      ctx.beginPath();
      // Three corners: top-left (x0,yTop), tip (x1,cy), bottom-left (x0,yBot)
      ctx.moveTo(x0, yTop + headR);
      ctx.arcTo(x0, yTop, x1, cy, headR);   // top-left corner
      ctx.arcTo(x1, cy, x0, yBot, headR);    // right tip
      ctx.arcTo(x0, yBot, x0, yTop, headR);  // bottom-left corner
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      // Subtle top highlight gradient
      const grad = ctx.createLinearGradient(x0, yTop, x0, yBot);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
      grad.addColorStop(0.4, 'rgba(255, 255, 255, 0)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
      ctx.fillStyle = grad;
      ctx.fill();

    };

    // Ghost notes — drawn first so they appear behind real notes
    if (ghostNotes && ghostNotes.length > 0) {
      for (const g of ghostNotes) {
        const gcx = (g.startTick - scrollX) * pixelsPerTick;
        const gcy = height - (g.pitch - scrollY + 0.5) * pixelsPerSemitone;
        if (gcx > width || gcy + pixelsPerSemitone < 0 || gcy > height) continue;

        // Ghost triangle head
        const gx0 = gcx;
        const gx1 = gcx + headW;
        const gyTop = gcy - headH / 2;
        const gyBot = gcy + headH / 2;
        const drawGhostTriangle = () => {
          ctx.beginPath();
          ctx.moveTo(gx0, gyTop + headR);
          ctx.arcTo(gx0, gyTop, gx1, gcy, headR);
          ctx.arcTo(gx1, gcy, gx0, gyBot, headR);
          ctx.arcTo(gx0, gyBot, gx0, gyTop, headR);
          ctx.closePath();
        };

        if (ghostCopyMode) {
          ctx.globalAlpha = 0.4;
          const hue = velocityToHue(g.velocity);
          ctx.fillStyle = `hsl(${hue}, 65%, ${30 + (g.velocity / 127) * 18}%)`;
          drawGhostTriangle();
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = 'rgba(100, 160, 255, 0.15)';
          ctx.strokeStyle = 'rgba(100, 160, 255, 0.3)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          drawGhostTriangle();
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    for (const note of unselected) drawNote(note, false);
    for (const note of selected) drawNote(note, true);

    // ─── Preview (ghost triangle at snapped position) ────────
    if (dotPreview) {
      const pcx = (dotPreview.tick - scrollX) * pixelsPerTick;
      const pcy = height - (dotPreview.pitch - scrollY + 0.5) * pixelsPerSemitone;
      const px0 = pcx;
      const px1 = pcx + headW;
      const pyTop = pcy - headH / 2;
      const pyBot = pcy + headH / 2;

      ctx.globalAlpha = 0.35;
      ctx.fillStyle = noteColor(80, false, false);
      ctx.beginPath();
      ctx.moveTo(px0, pyTop + headR);
      ctx.arcTo(px0, pyTop, px1, pcy, headR);
      ctx.arcTo(px1, pcy, px0, pyBot, headR);
      ctx.arcTo(px0, pyBot, px0, pyTop, headR);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

  }, [width, height, scrollX, scrollY, pixelsPerTick, pixelsPerSemitone, notes, selectedNoteIds, velocityDragNoteId, hoveredNoteId, ghostNotes, ghostCopyMode, nullDurations, dotPreview]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', top: 0, left: 0, width, height, cursor }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onContextMenu={onContextMenu}
    />
  );
};
