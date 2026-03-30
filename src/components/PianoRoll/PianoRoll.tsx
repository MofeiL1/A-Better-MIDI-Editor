import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Grid } from './Grid';
import { NoteLayer } from './NoteLayer';
import { PianoKeys } from './PianoKeys';
import { VelocityLane } from './VelocityLane';
import { useProjectStore } from '../../store/projectStore';
import { useUiStore } from '../../store/uiStore';
import { pixelToTick, yToPitch, snapTick, getSnapTicksFromDivision, tickToPixel } from '../../utils/timing';
import type { Note } from '../../types/model';

const VELOCITY_LANE_HEIGHT = 80;
const PIANO_KEY_WIDTH = 56;
const MIN_ZOOM_X = 0.05;
const MAX_ZOOM_X = 2;

// ─── Helpers: unified pointer coords from mouse or touch ────

function getPointerPos(
  e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent,
  canvas: HTMLElement,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  if ('touches' in e) {
    const t = e.touches[0] ?? (e as TouchEvent).changedTouches?.[0];
    if (!t) return null;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  const me = e as MouseEvent | React.MouseEvent;
  return { x: me.clientX - rect.left, y: me.clientY - rect.top };
}

export const PianoRoll: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 500 });

  const project = useProjectStore((s) => s.project);
  const addNote = useProjectStore((s) => s.addNote);
  const moveNotes = useProjectStore((s) => s.moveNotes);
  const resizeNotes = useProjectStore((s) => s.resizeNotes);
  const deleteNotes = useProjectStore((s) => s.deleteNotes);
  const setNoteVelocity = useProjectStore((s) => s.setNoteVelocity);

  const {
    tool, viewport, selectedNoteIds, snapDivision,
    activeClipId, scaleRoot, scaleMode, playheadTick, isPlaying,
    setViewport, setSelectedNoteIds, clearSelection,
    setActiveClip, setActiveTrack,
  } = useUiStore();

  const scrollX = viewport.scrollX;
  const scrollY = viewport.scrollY;
  const ppt = viewport.pixelsPerTick;
  const pps = viewport.pixelsPerSemitone;

  // Auto-select first clip
  useEffect(() => {
    if (!activeClipId && project.tracks.length > 0 && project.tracks[0].clips.length > 0) {
      setActiveTrack(project.tracks[0].id);
      setActiveClip(project.tracks[0].clips[0].id);
    }
  }, [activeClipId, project.tracks, setActiveTrack, setActiveClip]);

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height: height - VELOCITY_LANE_HEIGHT });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Active clip notes
  const activeClip = project.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.id === activeClipId);
  const notes = activeClip?.notes ?? [];

  const snapTicks = getSnapTicksFromDivision(snapDivision, project.ticksPerBeat);
  const ts = project.timeSignatureChanges[0] ?? { numerator: 4 };

  // ─── Interaction state ──────────────────────────────────

  const dragState = useRef<{
    type: 'none' | 'draw' | 'move' | 'resize' | 'select-box' | 'scroll';
    startX: number;
    startY: number;
    noteId?: string;
    // For two-finger pinch zoom
    startDist?: number;
    startPpt?: number;
    // For scroll
    scrollStartX?: number;
    scrollStartY?: number;
  }>({ type: 'none', startX: 0, startY: 0 });

  const hitTestNote = useCallback(
    (mx: number, my: number): { note: Note; isResize: boolean } | null => {
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        const nx = (n.startTick - scrollX) * ppt;
        const nw = n.duration * ppt;
        const ny = size.height - (n.pitch - scrollY + 1) * pps;
        if (mx >= nx && mx <= nx + nw && my >= ny && my <= ny + pps) {
          const isResize = mx >= nx + nw - 10; // Wider hit zone for touch
          return { note: n, isResize };
        }
      }
      return null;
    },
    [notes, scrollX, scrollY, ppt, pps, size.height]
  );

  // ─── Unified pointer handlers ───────────────────────────

  const handlePointerDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!activeClipId) return;
      const target = e.currentTarget;

      // Two-finger touch = scroll/zoom
      if ('touches' in e && e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        dragState.current = {
          type: 'scroll',
          startX: midX,
          startY: midY,
          startDist: dist,
          startPpt: ppt,
          scrollStartX: scrollX,
          scrollStartY: scrollY,
        };
        return;
      }

      const pos = getPointerPos(e, target);
      if (!pos) return;
      const { x: mx, y: my } = pos;

      if ('touches' in e) e.preventDefault();

      const tick = pixelToTick(mx, ppt, scrollX);
      const pitch = yToPitch(my, pps, scrollY, size.height);

      if (tool === 'draw') {
        const hit = hitTestNote(mx, my);
        if (hit) {
          if (hit.isResize) {
            dragState.current = { type: 'resize', startX: mx, startY: my, noteId: hit.note.id };
          } else {
            if (!selectedNoteIds.has(hit.note.id)) {
              setSelectedNoteIds(new Set([hit.note.id]));
            }
            dragState.current = { type: 'move', startX: mx, startY: my, noteId: hit.note.id };
          }
        } else {
          const snappedTick = snapTick(tick, snapTicks);
          addNote(activeClipId, {
            pitch: Math.min(127, Math.max(0, pitch)),
            startTick: Math.max(0, snappedTick),
            duration: snapTicks,
            velocity: 80,
            channel: 0,
            pitchBend: [],
          });
          clearSelection();
          dragState.current = { type: 'draw', startX: mx, startY: my };
        }
      } else if (tool === 'select') {
        const hit = hitTestNote(mx, my);
        if (hit) {
          if (hit.isResize) {
            dragState.current = { type: 'resize', startX: mx, startY: my, noteId: hit.note.id };
          } else {
            if (!selectedNoteIds.has(hit.note.id)) {
              setSelectedNoteIds(new Set([hit.note.id]));
            }
            dragState.current = { type: 'move', startX: mx, startY: my, noteId: hit.note.id };
          }
        } else {
          clearSelection();
          dragState.current = { type: 'select-box', startX: mx, startY: my };
        }
      } else if (tool === 'erase') {
        const hit = hitTestNote(mx, my);
        if (hit) {
          deleteNotes(activeClipId, [hit.note.id]);
        }
      }
    },
    [tool, activeClipId, ppt, pps, scrollX, scrollY, size.height, snapTicks, notes, selectedNoteIds, hitTestNote, addNote, clearSelection, deleteNotes, setSelectedNoteIds]
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!activeClipId) return;
      const ds = dragState.current;
      if (ds.type === 'none') return;

      // Two-finger scroll/zoom
      if (ds.type === 'scroll' && 'touches' in e && e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;

        // Pinch zoom
        if (ds.startDist && ds.startPpt) {
          const scale = dist / ds.startDist;
          const newPpt = Math.max(MIN_ZOOM_X, Math.min(MAX_ZOOM_X, ds.startPpt * scale));
          setViewport({ pixelsPerTick: newPpt });
        }

        // Pan
        const dx = midX - ds.startX;
        const dy = midY - ds.startY;
        if (ds.scrollStartX !== undefined && ds.scrollStartY !== undefined) {
          setViewport({
            scrollX: Math.max(0, ds.scrollStartX - dx / ppt),
            scrollY: Math.max(0, Math.min(115, ds.scrollStartY + dy / pps)),
          });
        }
        return;
      }

      const pos = getPointerPos(e, e.currentTarget);
      if (!pos) return;
      const { x: mx, y: my } = pos;
      const dx = mx - ds.startX;
      const dy = my - ds.startY;

      if ('touches' in e) e.preventDefault();

      if (ds.type === 'move' && ds.noteId) {
        const deltaTick = snapTick(dx / ppt, snapTicks);
        const deltaPitch = -Math.round(dy / pps);
        const idsToMove = selectedNoteIds.has(ds.noteId)
          ? Array.from(selectedNoteIds)
          : [ds.noteId];
        if (deltaTick !== 0 || deltaPitch !== 0) {
          moveNotes(activeClipId, idsToMove, deltaTick, deltaPitch);
          ds.startX = mx;
          ds.startY = my;
        }
      } else if (ds.type === 'resize' && ds.noteId) {
        const deltaDuration = snapTick(dx / ppt, snapTicks);
        if (deltaDuration !== 0) {
          const idsToResize = selectedNoteIds.has(ds.noteId)
            ? Array.from(selectedNoteIds)
            : [ds.noteId];
          resizeNotes(activeClipId, idsToResize, deltaDuration);
          ds.startX = mx;
        }
      }
    },
    [activeClipId, ppt, pps, snapTicks, selectedNoteIds, moveNotes, resizeNotes, setViewport]
  );

  const handlePointerUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!activeClipId) return;
      const ds = dragState.current;

      if (ds.type === 'select-box') {
        const pos = getPointerPos(e, e.currentTarget);
        if (pos) {
          const x1 = Math.min(ds.startX, pos.x);
          const x2 = Math.max(ds.startX, pos.x);
          const y1 = Math.min(ds.startY, pos.y);
          const y2 = Math.max(ds.startY, pos.y);

          const selected = new Set<string>();
          for (const n of notes) {
            const nx = (n.startTick - scrollX) * ppt;
            const nw = n.duration * ppt;
            const ny = size.height - (n.pitch - scrollY + 1) * pps;
            if (nx + nw >= x1 && nx <= x2 && ny + pps >= y1 && ny <= y2) {
              selected.add(n.id);
            }
          }
          setSelectedNoteIds(selected);
        }
      }

      dragState.current = { type: 'none', startX: 0, startY: 0 };
    },
    [activeClipId, notes, scrollX, scrollY, ppt, pps, size.height, setSelectedNoteIds]
  );

  // Wheel scroll/zoom (desktop)
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const newPpt = Math.max(MIN_ZOOM_X, Math.min(MAX_ZOOM_X, ppt * factor));
        setViewport({ pixelsPerTick: newPpt });
      } else if (e.shiftKey) {
        setViewport({ scrollX: Math.max(0, scrollX + e.deltaY / ppt) });
      } else {
        setViewport({ scrollY: Math.max(0, Math.min(115, scrollY - e.deltaY / pps)) });
      }
    },
    [ppt, pps, scrollX, scrollY, setViewport]
  );

  const handleVelocityChange = useCallback(
    (noteId: string, velocity: number) => {
      if (!activeClipId) return;
      setNoteVelocity(activeClipId, [noteId], velocity);
    },
    [activeClipId, setNoteVelocity]
  );

  const gridWidth = size.width - PIANO_KEY_WIDTH;

  // Playhead position
  const playheadX = tickToPixel(playheadTick, ppt, scrollX);
  const showPlayhead = playheadX >= 0 && playheadX <= gridWidth;

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1a1a1c',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <PianoKeys
          scrollY={scrollY}
          pixelsPerSemitone={pps}
          canvasHeight={size.height}
          scaleRoot={scaleRoot}
          scaleMode={scaleMode}
        />
        <div
          ref={canvasAreaRef}
          style={{ position: 'relative', flex: 1, overflow: 'hidden', touchAction: 'none' }}
          onWheel={handleWheel}
        >
          <Grid
            width={gridWidth}
            height={size.height}
            scrollX={scrollX}
            scrollY={scrollY}
            pixelsPerTick={ppt}
            pixelsPerSemitone={pps}
            ticksPerBeat={project.ticksPerBeat}
            numerator={ts.numerator}
            scaleRoot={scaleRoot}
            scaleMode={scaleMode}
          />
          <NoteLayer
            width={gridWidth}
            height={size.height}
            scrollX={scrollX}
            scrollY={scrollY}
            pixelsPerTick={ppt}
            pixelsPerSemitone={pps}
            notes={notes}
            selectedNoteIds={selectedNoteIds}
            scaleRoot={scaleRoot}
            scaleMode={scaleMode}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />
          {/* Playhead */}
          {showPlayhead && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: playheadX,
                width: 1.5,
                height: size.height,
                backgroundColor: isPlaying ? 'rgba(255, 100, 80, 0.8)' : 'rgba(255, 255, 255, 0.3)',
                pointerEvents: 'none',
                transition: isPlaying ? 'none' : 'left 0.05s ease',
              }}
            />
          )}
        </div>
      </div>
      <div style={{ display: 'flex' }}>
        <div style={{ width: PIANO_KEY_WIDTH, flexShrink: 0 }} />
        <VelocityLane
          width={gridWidth}
          height={VELOCITY_LANE_HEIGHT}
          scrollX={scrollX}
          pixelsPerTick={ppt}
          notes={notes}
          selectedNoteIds={selectedNoteIds}
          onVelocityChange={handleVelocityChange}
        />
      </div>
    </div>
  );
};
