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
  /** noteId -> chord tone label ("R", "3", "5", "b7", etc.) */
  chordToneMap?: Map<string, string>;
  /** measure index -> chord name ("Cmaj7", "Dm", etc.) */
  measureChordMap?: Map<number, string>;
  /** Ticks per measure, needed to render chord names at measure positions */
  ticksPerMeasure?: number;
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
  chordToneMap,
  measureChordMap,
  ticksPerMeasure,
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
        ctx.fillStyle = isSelected
          ? 'rgba(255, 255, 255, 0.9)'
          : 'rgba(255, 255, 255, 0.7)';
        ctx.font = `500 ${Math.min(10, noteH - 3)}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;
        const name = NOTE_NAMES[pitchClass(note.pitch)];
        ctx.fillText(name, noteX + 3, noteY + noteH * 0.45 + 1);
      }

      // Chord tone label — importance-based visual hierarchy
      const toneLabel = chordToneMap?.get(note.id);
      if (toneLabel && noteH >= 6) {
        // Importance tiers:
        // T1 (highest): Root — defines the chord
        // T2: 3rd/b3 — defines major/minor quality
        // T3: 7th/b7, altered 5ths (b5, #5) — defines chord color
        // T4: pure 5th — usually implied, least important
        // T5: extensions (9, 11, 13, b9, 2, 4, 6) — context-dependent
        type Tier = 1 | 2 | 3 | 4 | 5;
        let tier: Tier;
        switch (toneLabel) {
          case 'R':           tier = 1; break;
          case '3': case 'b3': tier = 2; break;
          case '7': case 'b7': case 'b5': case '#5': tier = 3; break;
          case '5':           tier = 4; break;
          default:            tier = 5; break; // 9, 11, 13, b9, 2, 4, 6, etc.
        }

        // Font size scales with tier: T1 biggest, T4/T5 smallest
        const baseFontSize = Math.min(11, noteH - 1);
        const tierFontScale = [1.0, 0.95, 0.85, 0.75, 0.75];
        const fontSize = Math.max(7, Math.round(baseFontSize * tierFontScale[tier - 1]));
        const fontWeight = tier <= 2 ? '700' : tier <= 3 ? '600' : '500';
        ctx.font = `${fontWeight} ${fontSize}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;

        const textWidth = ctx.measureText(toneLabel).width;
        const badgePadX = tier <= 2 ? 4 : 3;
        const badgePadY = tier <= 2 ? 2 : 1;
        const badgeW = textWidth + badgePadX * 2;
        const badgeH = fontSize + badgePadY * 2;
        const badgeX = noteX + noteW - badgeW - 2;
        const badgeY = noteY + Math.round((noteH - badgeH) / 2); // vertically centered

        // Badge background color by tier
        let bgColor: string;
        let textColor: string;
        switch (tier) {
          case 1: // Root — bold gold
            bgColor = 'rgba(255, 195, 40, 0.95)';
            textColor = 'rgba(30, 20, 0, 0.95)';
            break;
          case 2: // 3rd — warm orange-pink (defines major/minor)
            bgColor = 'rgba(255, 130, 80, 0.9)';
            textColor = 'rgba(40, 10, 0, 0.95)';
            break;
          case 3: // 7th, altered 5ths — cool blue
            bgColor = 'rgba(90, 160, 255, 0.85)';
            textColor = 'rgba(0, 10, 40, 0.95)';
            break;
          case 4: // Pure 5th — subtle gray
            bgColor = 'rgba(160, 165, 175, 0.5)';
            textColor = 'rgba(0, 0, 0, 0.7)';
            break;
          default: // Extensions — very subtle
            bgColor = 'rgba(140, 145, 155, 0.4)';
            textColor = 'rgba(0, 0, 0, 0.6)';
            break;
        }

        // Draw badge
        const badgeRadius = tier <= 2 ? 3 : 2;
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeRadius);
        ctx.fill();

        // Subtle border for T1 and T2 to pop more
        if (tier <= 2) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeRadius);
          ctx.stroke();
        }

        // Badge text
        ctx.fillStyle = textColor;
        ctx.fillText(toneLabel, badgeX + badgePadX, badgeY + badgePadY + fontSize * 0.85);
      }
    };

    for (const note of unselected) drawNote(note, false);
    for (const note of selected) drawNote(note, true);

    // Draw chord names at top of each measure
    if (measureChordMap && measureChordMap.size > 0 && ticksPerMeasure) {
      const chordFontSize = 12;
      ctx.font = `600 ${chordFontSize}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;
      ctx.textBaseline = 'top';

      for (const [measure, chordName] of measureChordMap) {
        const measureStartTick = measure * ticksPerMeasure;
        const x = (measureStartTick - scrollX) * pixelsPerTick;
        if (x < -100 || x > width + 100) continue;

        const textW = ctx.measureText(chordName).width;
        const padX = 5;
        const padY = 3;
        const bgW = textW + padX * 2;
        const bgH = chordFontSize + padY * 2;
        const bgX = x + 4;
        const bgY = 4;

        // Background pill
        ctx.fillStyle = 'rgba(30, 30, 36, 0.85)';
        ctx.beginPath();
        ctx.roundRect(bgX, bgY, bgW, bgH, 4);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(120, 180, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bgX, bgY, bgW, bgH, 4);
        ctx.stroke();

        // Text
        ctx.fillStyle = 'rgba(200, 220, 255, 0.95)';
        ctx.fillText(chordName, bgX + padX, bgY + padY);
      }
      ctx.textBaseline = 'alphabetic';
    }

  }, [width, height, scrollX, scrollY, pixelsPerTick, pixelsPerSemitone, notes, selectedNoteIds, velocityDragNoteId, hoveredNoteId, chordToneMap, measureChordMap, ticksPerMeasure]);

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
