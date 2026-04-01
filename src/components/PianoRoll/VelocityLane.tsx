import React, { useRef, useEffect, useCallback } from 'react';
import type { Note } from '../../types/model';
import { useProjectStore } from '../../store/projectStore';
import { useUiStore } from '../../store/uiStore';

interface VelocityLaneProps {
  width: number;
  height: number;
  scrollX: number;
  pixelsPerTick: number;
  notes: Note[];
  selectedNoteIds: Set<string>;
  onVelocityChange?: (noteId: string, velocity: number) => void;
}

// Match NoteLayer color scheme: purple(low) → blue → green → yellow → orange → red(high)
function velocityToHue(velocity: number): number {
  const v = velocity / 127;
  return 270 - v * 270;
}

function velBarColor(velocity: number, selected: boolean, highlighted: boolean): string {
  const hue = velocityToHue(velocity);
  const v = velocity / 127;
  if (highlighted) return `hsl(${hue}, 90%, 72%)`;
  if (selected) return `hsl(${hue}, 75%, 58%)`;
  return `hsl(${hue}, 55%, ${28 + v * 18}%)`;
}

const GRAB_ZONE = 8; // pixels from top of bar where grab is possible
const BAR_WIDTH = 6; // fixed thin bar width for clarity with overlaps

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
  const dragNoteId = useRef<string | null>(null);
  const canvasRect = useRef<DOMRect | null>(null);
  const beginDrag = useProjectStore((s) => s.beginDrag);
  const endDrag = useProjectStore((s) => s.endDrag);
  const setNoteVelocities = useProjectStore((s) => s.setNoteVelocities);
  const setVelocityDragNoteId = useUiStore((s) => s.setVelocityDragNoteId);
  const velocityDragNoteId = useUiStore((s) => s.velocityDragNoteId);
  const hoveredNoteId = useUiStore((s) => s.hoveredNoteId);

  // Compute bar x position (center of note start)
  const barX = useCallback((note: Note) => {
    return (note.startTick - scrollX) * pixelsPerTick;
  }, [scrollX, pixelsPerTick]);

  // Compute bar top y from velocity
  const barTopY = useCallback((velocity: number) => {
    return height - (velocity / 127) * (height - 4);
  }, [height]);

  // Body hit test: any point on a bar's visible area, respecting draw order.
  // Reverse-iterate the draw order so visually topmost bar wins.
  const hitTestBarBody = useCallback((mx: number, my: number): Note | null => {
    const activeId = useUiStore.getState().velocityDragNoteId || useUiStore.getState().hoveredNoteId;
    const sorted = [...notes].sort((a, b) => {
      if (a.startTick !== b.startTick) return a.startTick - b.startTick;
      if (a.velocity === b.velocity) {
        const hovA = a.id === activeId ? 1 : 0;
        const hovB = b.id === activeId ? 1 : 0;
        if (hovA !== hovB) return hovA - hovB;
        const selA = selectedNoteIds.has(a.id) ? 1 : 0;
        const selB = selectedNoteIds.has(b.id) ? 1 : 0;
        if (selA !== selB) return selA - selB;
      }
      return b.velocity - a.velocity || a.pitch - b.pitch;
    });
    for (let i = sorted.length - 1; i >= 0; i--) {
      const note = sorted[i];
      const x = barX(note);
      const bw = Math.max((note.duration ?? 0) * pixelsPerTick, BAR_WIDTH);
      if (mx < x - 1 || mx > x + bw + 1) continue;
      const topY = barTopY(note.velocity);
      if (my >= topY && my <= height) return note;
    }
    return null;
  }, [notes, selectedNoteIds, barX, barTopY, pixelsPerTick, height]);

  // Grab zone hit test: only the visually front bar's grab zone is accessible.
  const hitTestVelocityBar = useCallback((mx: number, my: number): Note | null => {
    const front = hitTestBarBody(mx, my);
    if (!front) return null;
    const topY = barTopY(front.velocity);
    if (Math.abs(my - topY) <= GRAB_ZONE) return front;
    return null;
  }, [hitTestBarBody, barTopY]);

  // --- Drawing ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, width, height);

    // Guide lines at 32, 64, 96
    for (const v of [32, 64, 96]) {
      const y = barTopY(v);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const minVisibleTick = scrollX;
    const maxVisibleTick = scrollX + width / pixelsPerTick;

    // Sort: highest velocity drawn first (background), lowest last (foreground).
    // Hovered/selected notes promoted above close-velocity neighbors (within threshold)
    // but still below notes with genuinely lower velocity.
    const activeId = velocityDragNoteId || hoveredNoteId;
    const sortedNotes = [...notes]
      .filter((n) => n.startTick + (n.duration ?? 0) >= minVisibleTick && n.startTick <= maxVisibleTick)
      .sort((a, b) => {
        if (a.startTick !== b.startTick) return a.startTick - b.startTick;
        if (a.velocity === b.velocity) {
          // Hovered/dragged note on top of same-velocity neighbors
          const hovA = a.id === activeId ? 1 : 0;
          const hovB = b.id === activeId ? 1 : 0;
          if (hovA !== hovB) return hovA - hovB;
          // Selected notes on top of same-velocity unselected neighbors
          const selA = selectedNoteIds.has(a.id) ? 1 : 0;
          const selB = selectedNoteIds.has(b.id) ? 1 : 0;
          if (selA !== selB) return selA - selB;
        }
        return b.velocity - a.velocity || a.pitch - b.pitch;
      });

    const activeHighlightId = velocityDragNoteId || hoveredNoteId;

    for (const note of sortedNotes) {
      const isHighlighted = note.id === velocityDragNoteId;
      const isHovered = !isHighlighted && note.id === activeHighlightId;
      const isSelected = selectedNoteIds.has(note.id);

      const x = Math.round(barX(note));
      const topY = barTopY(note.velocity);
      const barH = height - topY;
      const bw = Math.max(Math.round((note.duration ?? 0) * pixelsPerTick), BAR_WIDTH);

      // Bar body — no gap between adjacent notes
      ctx.fillStyle = velBarColor(note.velocity, isSelected, isHighlighted || isHovered);
      ctx.fillRect(x, topY, bw, barH);

      // Top cap + left edge — dark border for unselected, bright for selected/highlighted
      if (isHighlighted || isSelected) {
        ctx.fillStyle = `rgba(255, 255, 255, ${isHighlighted ? 0.6 : 0.35})`;
      } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      }
      ctx.fillRect(x + 2, topY, bw - 2, 2); // top (skip left corner)
      ctx.fillRect(x, topY, 2, barH);      // left (full height)

      // Velocity value label — inside bar top-left, or above if bar too short
      if (bw > 12 || isHighlighted) {
        ctx.fillStyle = isHighlighted ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.5)';
        ctx.font = `${isHighlighted ? '600' : '500'} 9px -apple-system, "SF Pro Text", sans-serif`;
        const labelY = barH >= 14 ? topY + 12 : topY - 3;
        ctx.fillText(String(note.velocity), x + 4, labelY);
      }
    }
  }, [width, height, scrollX, pixelsPerTick, notes, selectedNoteIds, velocityDragNoteId, hoveredNoteId, barX, barTopY]);

  // --- Interaction ---
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    canvasRect.current = rect;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Grab hit: visually front bar + cursor in its grab zone
    const grabHit = hitTestVelocityBar(mx, my);

    if (!grabHit) {
      // No grab — just select the visually front bar
      const bodyHit = hitTestBarBody(mx, my);
      if (bodyHit) {
        const { selectedNoteIds: sel, setSelectedNoteIds: setSel } = useUiStore.getState();
        if (e.shiftKey) {
          const next = new Set(sel);
          if (next.has(bodyHit.id)) next.delete(bodyHit.id); else next.add(bodyHit.id);
          setSel(next);
        } else if (!sel.has(bodyHit.id)) {
          setSel(new Set([bodyHit.id]));
        }
      }
      return;
    }

    // Grab hit — select and start drag
    const { selectedNoteIds: sel, setSelectedNoteIds: setSel } = useUiStore.getState();
    if (e.shiftKey) {
      const next = new Set(sel);
      next.add(grabHit.id);
      setSel(next);
    } else if (!sel.has(grabHit.id)) {
      setSel(new Set([grabHit.id]));
    }

    // Start dragging this specific note's velocity — relative mode (no jump)
    dragNoteId.current = grabHit.id;
    beginDrag();
    setVelocityDragNoteId(grabHit.id);

    // Record mouse Y at grab time and snapshot velocities of all selected notes
    const startClientY = e.clientY;
    const pxPerVel = (height - 4) / 127;
    const currentSel = useUiStore.getState().selectedNoteIds;
    const dragInSelection = currentSel.has(grabHit.id);
    const clipId = useUiStore.getState().activeClipId;

    // Snapshot: read fresh notes from store to avoid stale closure
    const freshNotes = useProjectStore.getState().project.tracks
      .flatMap((t) => t.clips).flatMap((c) => c.notes);

    const velSnapshot: Map<string, number> = new Map();
    if (dragInSelection && currentSel.size > 1) {
      for (const note of freshNotes) {
        if (currentSel.has(note.id)) velSnapshot.set(note.id, note.velocity);
      }
    } else {
      velSnapshot.set(grabHit.id, grabHit.velocity);
    }

    const onMove = (ev: MouseEvent) => {
      if (!dragNoteId.current || !clipId) return;
      const deltaY = startClientY - ev.clientY;
      const deltaVel = Math.round(deltaY / pxPerVel);
      if (velSnapshot.size === 1) {
        const [id, startVel] = velSnapshot.entries().next().value!;
        onVelocityChange?.(id, Math.max(1, Math.min(127, startVel + deltaVel)));
      } else {
        const batch = new Map<string, number>();
        for (const [id, startVel] of velSnapshot) {
          batch.set(id, Math.max(1, Math.min(127, startVel + deltaVel)));
        }
        setNoteVelocities(clipId, batch);
      }
    };

    const onUp = () => {
      dragNoteId.current = null;
      setVelocityDragNoteId(null);
      endDrag();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [hitTestVelocityBar, hitTestBarBody, height, onVelocityChange, beginDrag, endDrag, setVelocityDragNoteId, setNoteVelocities]);

  // Update cursor and hover highlight
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragNoteId.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const grabHit = hitTestVelocityBar(mx, my);
    (e.currentTarget as HTMLCanvasElement).style.cursor = grabHit ? 'ns-resize' : 'default';
    // Hover: broader hit test on bar body
    const hoverHit = hitTestBarBody(mx, my);
    useUiStore.getState().setHoveredNoteId(hoverHit?.id ?? null);
  }, [hitTestVelocityBar, hitTestBarBody]);

  const handleMouseLeave = useCallback(() => {
    if (!dragNoteId.current) {
      useUiStore.getState().setHoveredNoteId(null);
    }
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        cursor: 'default',
        borderTop: '1px solid #333',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    />
  );
};
