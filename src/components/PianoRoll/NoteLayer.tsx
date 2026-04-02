import React, { useRef, useEffect } from 'react';
import type { Note } from '../../types/model';
import { useUiStore } from '../../store/uiStore';

export type HeatmapData = {
  cells: Int8Array;
  interval: number;
  tMin: number;
  pMin: number;
  pitchRange: number;
  tickSteps: number;
  defaultValue: number; // 1=melody, -1=chord — used for cells outside the pre-computed range
};

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
  /** Map from note ID to effective role ('melody' | 'chord') */
  roleMap?: Map<string, 'melody' | 'chord'>;
  /** Semi-transparent preview showing where a dot will be placed */
  /** Ghost notes shown during drag at original positions */
  ghostNotes?: { pitch: number; startTick: number; duration: number | null; velocity: number }[];
  /** If true, ghost notes look like real notes (semi-transparent) for copy mode */
  ghostCopyMode?: boolean;
  /** Pre-computed heatmap data (null = disabled) */
  heatmapData?: HeatmapData | null;
  cursor?: string;
  onMouseDown?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

// ─── Role-based color system (melody = blue, chord = orange) ─────────
function roleColor(role: 'melody' | 'chord', selected: boolean, hovered: boolean): string {
  const hue = role === 'melody' ? 210 : 30;
  if (selected) return `hsl(${hue}, ${role === 'melody' ? 85 : 80}%, ${role === 'melody' ? 72 : 70}%)`;
  if (hovered)  return `hsl(${hue}, ${role === 'melody' ? 75 : 70}%, ${role === 'melody' ? 52 : 50}%)`;
  return `hsl(${hue}, ${role === 'melody' ? 80 : 75}%, ${role === 'melody' ? 60 : 58}%)`;
}

// Velocity → opacity (auxiliary channel: 0.70–1.00)
function velocityAlpha(velocity: number): number {
  return 0.70 + (velocity / 127) * 0.30;
}

// Velocity → extension line thickness ratio (main channel: 0.30–0.80 of pixelsPerSemitone)
function velocityThicknessRatio(velocity: number): number {
  return 0.30 + (velocity / 127) * 0.50;
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
  roleMap,

  ghostNotes,
  ghostCopyMode,
  heatmapData,
  cursor = 'crosshair',
  onMouseDown,
  onMouseMove,
  onMouseLeave,
  onContextMenu,
}) => {
  const velocityDragNoteId = useUiStore((s) => s.velocityDragNoteId);
  const hoveredNoteId = useUiStore((s) => s.hoveredNoteId);
  const isPlaying = useUiStore((s) => s.isPlaying);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Suppress hover-triggered redraws during playback — hover highlight isn't needed while playing
  const effectiveHoverId = isPlaying ? null : hoveredNoteId;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);
    // Only reallocate buffer when dimensions change (avoids expensive reset every frame)
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const minVisibleTick = scrollX;
    const maxVisibleTick = scrollX + width / pixelsPerTick;
    const minVisiblePitch = scrollY - 1;
    const maxVisiblePitch = scrollY + Math.ceil(height / pixelsPerSemitone) + 1;

    // ─── Draw heatmap from pre-computed grid (flat color, supports out-of-range default) ─────
    if (heatmapData) {
      const { cells, interval, tMin, pMin, pitchRange, tickSteps, defaultValue } = heatmapData;
      let step = 1;
      while (interval * step * pixelsPerTick < 2 && step < tickSteps) step *= 2;
      const cellPxW = interval * step * pixelsPerTick;

      // Unclamped range — out-of-range cells use defaultValue
      const rawFirstTi = Math.floor((minVisibleTick - tMin) / interval / step) * step;
      const rawLastTi = Math.ceil((maxVisibleTick - tMin) / interval);
      const rawFirstPi = Math.floor(minVisiblePitch - pMin);
      const rawLastPi = Math.ceil(maxVisiblePitch - pMin);

      const melStyle = 'rgba(100, 160, 255, 0.06)';
      const chStyle = 'rgba(255, 180, 100, 0.06)';

      const cellVal = (ti: number, pi: number) => {
        if (ti >= 0 && ti < tickSteps && pi >= 0 && pi < pitchRange) return cells[ti * pitchRange + pi];
        return defaultValue;
      };

      ctx.fillStyle = melStyle;
      for (let ti = rawFirstTi; ti <= rawLastTi; ti += step) {
        const cellX = (tMin + ti * interval - scrollX) * pixelsPerTick;
        for (let pi = rawFirstPi; pi <= rawLastPi; pi++) {
          if (cellVal(ti, pi) !== 1) continue;
          ctx.fillRect(cellX, height - (pMin + pi - scrollY + 1) * pixelsPerSemitone, cellPxW, pixelsPerSemitone);
        }
      }
      ctx.fillStyle = chStyle;
      for (let ti = rawFirstTi; ti <= rawLastTi; ti += step) {
        const cellX = (tMin + ti * interval - scrollX) * pixelsPerTick;
        for (let pi = rawFirstPi; pi <= rawLastPi; pi++) {
          if (cellVal(ti, pi) !== -1) continue;
          ctx.fillRect(cellX, height - (pMin + pi - scrollY + 1) * pixelsPerSemitone, cellPxW, pixelsPerSemitone);
        }
      }
    }

    const activeHighlightId = velocityDragNoteId || effectiveHoverId;
    const headH = pixelsPerSemitone; // equilateral: side = track height
    const headW = headH * Math.sqrt(3) / 2; // equilateral triangle width
    const headR = Math.max(1, headH * 0.15); // visible rounded corners

    // Separate into 4 groups for draw order: chord below melody, unselected below selected
    const chordUnselected: Note[] = [];
    const melodyUnselected: Note[] = [];
    const chordSelected: Note[] = [];
    const melodySelected: Note[] = [];
    for (const note of notes) {
      if (note.pitch < minVisiblePitch || note.pitch > maxVisiblePitch) continue;
      const effectiveDur = note.duration !== null
        ? note.duration
        : (nullDurations?.get(note.id) ?? 0);
      const noteEnd = note.startTick + effectiveDur;
      if (noteEnd < minVisibleTick || note.startTick > maxVisibleTick) continue;
      const isChord = (roleMap?.get(note.id) ?? 'melody') === 'chord';
      const isSel = selectedNoteIds.has(note.id);
      if (isChord) {
        (isSel ? chordSelected : chordUnselected).push(note);
      } else {
        (isSel ? melodySelected : melodyUnselected).push(note);
      }
    }

    const drawNote = (note: Note, isSelected: boolean) => {
      const cx = (note.startTick - scrollX) * pixelsPerTick;
      const cy = height - (note.pitch - scrollY + 0.5) * pixelsPerSemitone;
      const isHovered = note.id === activeHighlightId;
      const isNullDuration = note.duration === null;
      const role: 'melody' | 'chord' = (roleMap?.get(note.id) ?? 'melody') as 'melody' | 'chord';
      const effectiveDur = isNullDuration
        ? (nullDurations?.get(note.id) ?? 0)
        : note.duration!;

      const color = roleColor(role, isSelected, isHovered);
      const vAlpha = isSelected ? 1.0 : velocityAlpha(note.velocity);
      ctx.globalAlpha = vAlpha;

      // ─── Extension line (velocity-based thickness, clean roundRect) ─────────────
      if (effectiveDur > 0) {
        const tailFullW = effectiveDur * pixelsPerTick;
        const tailH = Math.max(2, pixelsPerSemitone * velocityThicknessRatio(note.velocity));
        const r = tailH * 0.2;

        ctx.beginPath();
        ctx.roundRect(cx, cy - tailH / 2, tailFullW, tailH, r);
        if (isSelected) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.lineWidth = 5;
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
        ctx.fillStyle = color;
        ctx.fill();
      }

      // ─── Triangle head ▷ (always fully opaque) ────────────────────────────────
      ctx.globalAlpha = 1;
      const x0 = cx;
      const x1 = cx + headW;
      const yTop = cy - headH / 2;
      const yBot = cy + headH / 2;

      ctx.beginPath();
      ctx.moveTo(x0, yTop + headR);
      ctx.arcTo(x0, yTop, x1, cy, headR);
      ctx.arcTo(x1, cy, x0, yBot, headR);
      ctx.arcTo(x0, yBot, x0, yTop, headR);
      ctx.closePath();
      if (isSelected) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 5;
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.fill();

      // Subtle top highlight gradient
      const grad = ctx.createLinearGradient(x0, yTop, x0, yBot);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
      grad.addColorStop(0.4, 'rgba(255, 255, 255, 0)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.globalAlpha = 1;
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
          ctx.fillStyle = roleColor('melody', false, false); // ghost copies use default role color
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

    // Draw order: chord unselected → melody unselected → chord selected → melody selected
    for (const note of chordUnselected) drawNote(note, false);
    for (const note of melodyUnselected) drawNote(note, false);
    for (const note of chordSelected) drawNote(note, true);
    for (const note of melodySelected) drawNote(note, true);

  }, [width, height, scrollX, scrollY, pixelsPerTick, pixelsPerSemitone, notes, selectedNoteIds, velocityDragNoteId, effectiveHoverId, ghostNotes, ghostCopyMode, nullDurations, roleMap, heatmapData, isPlaying]);

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
