import React, { useRef, useEffect } from 'react';
import type { Note } from '../../types/model';
import type { ResolutionInfo } from '../../utils/chordAnalysis';
import type { ChordLabel } from '../../utils/chordDetection';
import { applyJazzSymbols } from '../../utils/chordFormat';
import { pitchClass, getScaleDegreeName } from '../../utils/music';
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
  /** Chord labels (roman numerals) positioned at each chord's startTick */
  chordLabels?: ChordLabel[];
  /** Scale root (0-11) for scale degree display */
  scaleRoot?: number;
  /** Scale mode for scale degree display */
  scaleMode?: string;
  /** Resolution relationships between consecutive chords */
  resolutions?: ResolutionInfo[];
  /** Ticks per measure, needed for resolution label positioning */
  ticksPerMeasure?: number;
  /** Whether to display jazz graphic symbols */
  useJazzSymbols?: boolean;
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
  chordToneMap,
  chordLabels,
  scaleRoot,
  scaleMode,
  resolutions,
  ticksPerMeasure,
  useJazzSymbols,
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

    // Pre-compute lowest note ID per measure (for bass line degree display)
    const lowestNotePerMeasure = new Set<string>();
    if (ticksPerMeasure && ticksPerMeasure > 0) {
      const measureLowest = new Map<number, { id: string; pitch: number }>();
      for (const note of notes) {
        const m = Math.floor(note.startTick / ticksPerMeasure);
        const cur = measureLowest.get(m);
        if (!cur || note.pitch < cur.pitch) {
          measureLowest.set(m, { id: note.id, pitch: note.pitch });
        }
      }
      for (const { id } of measureLowest.values()) {
        lowestNotePerMeasure.add(id);
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

      // Note name + scale degree label (left side)
      if (noteW > 24 && noteH >= 11) {
        ctx.font = `500 ${Math.min(10, noteH - 3)}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;
        const name = NOTE_NAMES[pitchClass(note.pitch)];
        const toneLabel = chordToneMap?.get(note.id);
        const degreeStr = (scaleRoot != null)
          ? getScaleDegreeName(note.pitch, scaleRoot, toneLabel ?? undefined)
          : '';
        const isBassNote = lowestNotePerMeasure.has(note.id);
        const showDegree = degreeStr !== '' && (isSelected || isHovered || isBassNote);

        // Always show note name
        ctx.fillStyle = isSelected
          ? 'rgba(255, 255, 255, 0.9)'
          : 'rgba(255, 255, 255, 0.7)';
        ctx.fillText(name, noteX + 3, noteY + noteH * 0.45 + 1);

        // Show scale degree with caret (^) above — standard music theory notation
        if (showDegree && noteW > 36) {
          const degFontSize = Math.min(9, noteH - 3);
          ctx.font = `600 ${degFontSize}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;
          const degTextWidth = ctx.measureText(degreeStr).width;

          const padX = 3;
          const padY = 1;
          const caretSpace = 4;
          const badgeW = degTextWidth + padX * 2;
          const badgeH = degFontSize + padY * 2 + caretSpace;

          // Bass notes: badge below the note; others: inside the note next to name
          let badgeX: number;
          let badgeY: number;
          if (isBassNote) {
            badgeX = noteX + 3;
            badgeY = noteY + noteH + 2; // below the note
          } else {
            ctx.font = `500 ${Math.min(10, noteH - 3)}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;
            const nameWidth = ctx.measureText(name).width;
            badgeX = noteX + 3 + nameWidth + 4;
            badgeY = noteY + Math.round((noteH - badgeH) / 2);
          }

          // Background pill
          ctx.fillStyle = 'rgba(30, 30, 36, 0.8)';
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
          ctx.fill();

          // Subtle border
          ctx.strokeStyle = 'rgba(200, 200, 220, 0.3)';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
          ctx.stroke();

          // Text color
          ctx.fillStyle = isSelected
            ? 'rgba(230, 230, 240, 0.95)'
            : 'rgba(200, 200, 210, 0.85)';

          // Caret
          const caretFontSize = Math.max(6, degFontSize - 2);
          ctx.font = `400 ${caretFontSize}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;
          const caretWidth = ctx.measureText('^').width;
          const caretX = badgeX + padX + (degTextWidth - caretWidth) / 2;
          ctx.fillText('^', caretX, badgeY + padY + caretFontSize * 0.85);

          // Degree number
          ctx.font = `600 ${degFontSize}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;
          ctx.fillText(degreeStr, badgeX + padX, badgeY + padY + caretSpace + degFontSize * 0.85);
        }
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

    // Display formatter: apply jazz symbols if enabled
    const fmt = (s: string) => useJazzSymbols ? applyJazzSymbols(s) : s;

    // Draw Roman numeral labels at each chord's startTick (chord names are in ChordTrack)
    if (chordLabels && chordLabels.length > 0) {
      ctx.textBaseline = 'top';
      const padX = 5;
      const padY = 2;

      for (const label of chordLabels) {
        const romanText = fmt(label.roman);
        if (!romanText) continue;

        const x = (label.startTick - scrollX) * pixelsPerTick;
        if (x < -100 || x > width + 100) continue;

        const bgX = x + 4;
        const curY = 4;
        const romanFontSize = 12;
        ctx.font = `700 ${romanFontSize}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;
        const romanW = ctx.measureText(romanText).width;
        const rBgW = romanW + padX * 2;
        const rBgH = romanFontSize + padY * 2;

        ctx.fillStyle = 'rgba(30, 30, 36, 0.85)';
        ctx.beginPath();
        ctx.roundRect(bgX, curY, rBgW, rBgH, 4);
        ctx.fill();

        ctx.strokeStyle = 'rgba(120, 180, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bgX, curY, rBgW, rBgH, 4);
        ctx.stroke();

        ctx.fillStyle = 'rgba(200, 220, 255, 0.95)';
        ctx.fillText(romanText, bgX + padX, curY + padY);
      }
      ctx.textBaseline = 'alphabetic';
    }

    // Draw resolution labels right-aligned before the "to" chord's start
    if (resolutions && resolutions.length > 0) {
      const resFontSize = 10;
      ctx.textBaseline = 'top';

      for (const res of resolutions) {
        // Position: right-aligned before the target chord's start
        const endX = (res.toTick - scrollX) * pixelsPerTick;
        if (endX < -50 || endX > width + 50) continue;

        ctx.font = `600 ${resFontSize}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;
        const resText = fmt(res.label);
        const textW = ctx.measureText(resText).width;
        const padX = 4;
        const padY = 2;
        const bgW = textW + padX * 2;
        const bgH = resFontSize + padY * 2;
        // Right-aligned: pill ends a few px before the barline
        const bgX = endX - bgW - 4;
        const bgY = 4;

        // Color by resolution type
        let borderColor: string;
        let textColor: string;
        switch (res.type) {
          case 'dominant':
            borderColor = 'rgba(100, 220, 100, 0.6)';
            textColor = 'rgba(140, 255, 140, 0.95)';
            break;
          case 'predominant':
            borderColor = 'rgba(180, 180, 100, 0.6)';
            textColor = 'rgba(230, 230, 140, 0.95)';
            break;
          case 'tritone-sub':
            borderColor = 'rgba(220, 120, 255, 0.6)';
            textColor = 'rgba(230, 160, 255, 0.95)';
            break;
          case 'deceptive':
            borderColor = 'rgba(255, 160, 80, 0.6)';
            textColor = 'rgba(255, 190, 120, 0.95)';
            break;
        }

        // Background pill (same style as chord names)
        ctx.fillStyle = 'rgba(30, 30, 36, 0.85)';
        ctx.beginPath();
        ctx.roundRect(bgX, bgY, bgW, bgH, 4);
        ctx.fill();

        // Border
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bgX, bgY, bgW, bgH, 4);
        ctx.stroke();

        // Text
        ctx.fillStyle = textColor;
        ctx.fillText(resText, bgX + padX, bgY + padY);
      }
      ctx.textBaseline = 'alphabetic';
    }

  }, [width, height, scrollX, scrollY, pixelsPerTick, pixelsPerSemitone, notes, selectedNoteIds, velocityDragNoteId, hoveredNoteId, chordToneMap, chordLabels, ticksPerMeasure, scaleRoot, scaleMode, resolutions, useJazzSymbols, ghostNotes, ghostCopyMode]);

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
