import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { ChordEvent } from '../../types/model';
import { PITCH_CLASS_NAMES } from '../../utils/chordAnalysis';
import { applyJazzSymbols } from '../../utils/chordFormat';

interface ChordTrackProps {
  width: number;
  height: number;
  scrollX: number;
  pixelsPerTick: number;
  snapTicks: number;
  chords: ChordEvent[];
  onResizeEnd: (chordId: string, memberNoteIds: string[], deltaTicks: number) => void;
  onTrimStart: (chordId: string, memberNoteIds: string[], deltaTicks: number) => void;
  onDragBegin: () => void;
  onDragEnd: () => void;
  useJazzSymbols?: boolean;
  selectedNoteIds: Set<string>;
  onSelectChordNotes: (noteIds: string[], addToSelection: boolean) => void;
}

const HANDLE_PX = 6; // handle zone width in pixels, entirely inside the chord

function chordDisplayName(chord: ChordEvent): string {
  const rootName = PITCH_CLASS_NAMES[chord.root];
  const bassStr = chord.bass !== undefined ? '/' + PITCH_CLASS_NAMES[chord.bass] : '';
  return rootName + chord.quality + bassStr;
}

type HoverInfo = { chordId: string; edge: 'start' | 'end' } | null;

type DragState = {
  type: 'none';
} | {
  type: 'resize-end' | 'trim-start';
  chordId: string;
  memberNoteIds: string[];
  startX: number;
  accumTicks: number;
};

export const ChordTrack: React.FC<ChordTrackProps> = ({
  width,
  height,
  scrollX,
  pixelsPerTick,
  snapTicks,
  chords,
  onResizeEnd,
  onTrimStart,
  onDragBegin,
  onDragEnd,
  useJazzSymbols,
  selectedNoteIds,
  onSelectChordNotes,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragState = useRef<DragState>({ type: 'none' });
  const [cursor, setCursor] = useState('default');
  const [hover, setHover] = useState<HoverInfo>(null);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#1e1e22';
    ctx.fillRect(0, 0, width, height);

    // Bottom border
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(width, height - 0.5);
    ctx.stroke();

    const barH = height;

    const inset = 0; // px inset from alignment point on each side

    for (const chord of chords) {
      const rawX = (chord.startTick - scrollX) * pixelsPerTick;
      const rawW = (chord.endTick - chord.startTick) * pixelsPerTick;
      const x = rawX + inset;
      const w = rawW - inset * 2;

      if (x + w < 0 || x > width) continue;
      if (w < 2) continue;

      const isHovered = hover && hover.chordId === chord.id;
      const members = chord.memberNoteIds ?? [];
      const isSelected = members.length > 0 && members.every((id) => selectedNoteIds.has(id));

      // Bar fill
      const fillAlpha = isSelected ? 0.45 : isHovered ? 0.35 : 0.2;
      ctx.fillStyle = `rgba(100, 160, 255, ${fillAlpha})`;
      ctx.beginPath();
      ctx.roundRect(x, 0, w, barH, 5);
      ctx.fill();

      // Selected border
      if (isSelected) {
        ctx.strokeStyle = 'rgba(150, 200, 255, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(x, 0, w, barH, 5);
        ctx.stroke();
      }

      // Chord name (small, inside bar)
      if (w > 30) {
        const fontSize = Math.min(10, barH - 2);
        ctx.font = `500 ${fontSize}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;
        ctx.fillStyle = 'rgba(180, 210, 255, 0.7)';
        ctx.textBaseline = 'middle';
        const name = chordDisplayName(chord);
        ctx.fillText(useJazzSymbols ? applyJazzSymbols(name) : name, x + 5, height / 2, w - 10);
      }
    }
    ctx.textBaseline = 'alphabetic';
  }, [width, height, scrollX, pixelsPerTick, chords, hover, useJazzSymbols, selectedNoteIds]);

  // Hit test: handle zones are INSIDE each chord (not straddling the boundary)
  const hitTest = useCallback(
    (clientX: number): { chord: ChordEvent; edge: 'start' | 'end' } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const mx = clientX - rect.left;

      const inset = 0;
      for (const chord of chords) {
        const barLeft = (chord.startTick - scrollX) * pixelsPerTick + inset;
        const barRight = (chord.endTick - scrollX) * pixelsPerTick - inset;

        // Start handle: left side of visible bar
        if (mx >= barLeft && mx <= barLeft + HANDLE_PX) {
          return { chord, edge: 'start' };
        }
        // End handle: right side of visible bar
        if (mx >= barRight - HANDLE_PX && mx <= barRight) {
          return { chord, edge: 'end' };
        }
      }
      return null;
    },
    [chords, scrollX, pixelsPerTick],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragState.current.type !== 'none') return;
      const hit = hitTest(e.clientX);
      setCursor(hit ? 'ew-resize' : 'default');
      setHover(hit ? { chordId: hit.chord.id, edge: hit.edge } : null);
    },
    [hitTest],
  );

  // Body hit test: is mouse inside any chord (not on edge)?
  const bodyHitTest = useCallback(
    (clientX: number): ChordEvent | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const mx = clientX - rect.left;
      for (const chord of chords) {
        const left = (chord.startTick - scrollX) * pixelsPerTick;
        const right = (chord.endTick - scrollX) * pixelsPerTick;
        if (mx >= left && mx <= right) return chord;
      }
      return null;
    },
    [chords, scrollX, pixelsPerTick],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;

      // Edge drag takes priority
      const hit = hitTest(e.clientX);
      if (hit) {
        e.preventDefault();
        onDragBegin();

        const memberIds = hit.chord.memberNoteIds ?? [];
        dragState.current = {
          type: hit.edge === 'end' ? 'resize-end' : 'trim-start',
          chordId: hit.chord.id,
          memberNoteIds: memberIds,
          startX: e.clientX,
          accumTicks: 0,
        };
        setCursor('ew-resize');

        const onMove = (ev: MouseEvent) => {
          const ds = dragState.current;
          if (ds.type === 'none') return;
          const dx = ev.clientX - ds.startX;
          const rawDelta = dx / pixelsPerTick;
          const snappedDelta = Math.round(rawDelta / snapTicks) * snapTicks;
          if (snappedDelta !== ds.accumTicks) {
            const increment = snappedDelta - ds.accumTicks;
            ds.accumTicks = snappedDelta;
            if (ds.type === 'resize-end') {
              onResizeEnd(ds.chordId, ds.memberNoteIds, increment);
            } else {
              onTrimStart(ds.chordId, ds.memberNoteIds, increment);
            }
          }
        };

        const onUp = () => {
          dragState.current = { type: 'none' };
          onDragEnd();
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return;
      }

      // Body click: select chord's member notes
      const chord = bodyHitTest(e.clientX);
      if (chord && chord.memberNoteIds && chord.memberNoteIds.length > 0) {
        onSelectChordNotes(chord.memberNoteIds, e.shiftKey);
      }
    },
    [hitTest, bodyHitTest, pixelsPerTick, snapTicks, onResizeEnd, onTrimStart, onDragBegin, onDragEnd, onSelectChordNotes],
  );

  const handleMouseLeave = useCallback(() => {
    if (dragState.current.type === 'none') {
      setCursor('default');
      setHover(null);
    }
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: 'block', cursor }}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseLeave}
    />
  );
};
