import React, { useRef, useEffect, useState, useCallback } from 'react';
import { MobileNoteCanvas } from './MobileNoteCanvas';
import { MobilePianoKeys, KEY_WIDTH } from './MobilePianoKeys';
import { useProjectStore } from '../../store/projectStore';
import { useUiStore } from '../../store/uiStore';
import { pixelToTick, yToPitch, snapTick, getSnapTicksFromDivision, tickToPixel } from '../../utils/timing';
import type { Note } from '../../types/model';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 2;

/**
 * Mobile PianoRoll — Option C interaction model:
 * - Default: single finger = scroll, two finger = pinch zoom
 * - Edit mode: single finger = tool operation (draw/select/erase)
 * - Edit mode activated by tapping tool in MobileToolbar
 */

export const MobilePianoRoll: React.FC<{ editMode: boolean }> = ({ editMode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 300, height: 400 });

  const project = useProjectStore((s) => s.project);
  const addNote = useProjectStore((s) => s.addNote);
  const moveNotes = useProjectStore((s) => s.moveNotes);
  const resizeNotes = useProjectStore((s) => s.resizeNotes);
  const deleteNotes = useProjectStore((s) => s.deleteNotes);

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
      setSize({ width, height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const activeClip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === activeClipId);
  const notes = activeClip?.notes ?? [];
  const snapTickVal = getSnapTicksFromDivision(snapDivision, project.ticksPerBeat);
  const ts = project.timeSignatureChanges[0] ?? { numerator: 4 };

  // ─── Touch state ────────────────────────────────────────

  const touchState = useRef<{
    type: 'none' | 'scroll' | 'pinch' | 'edit-move' | 'edit-draw' | 'edit-resize';
    // Scroll/pinch
    lastX: number;
    lastY: number;
    pinchDist: number;
    pinchPpt: number;
    // Edit
    noteId?: string;
    startX: number;
    startY: number;
  }>({ type: 'none', lastX: 0, lastY: 0, pinchDist: 0, pinchPpt: 0, startX: 0, startY: 0 });

  const hitTestNote = useCallback(
    (mx: number, my: number): { note: Note; isResize: boolean } | null => {
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        const nx = (n.startTick - scrollX) * ppt;
        const nw = n.duration * ppt;
        const ny = size.height - (n.pitch - scrollY + 1) * pps;
        if (mx >= nx && mx <= nx + nw && my >= ny && my <= ny + pps) {
          return { note: n, isResize: mx >= nx + nw - 16 }; // 16px for touch
        }
      }
      return null;
    },
    [notes, scrollX, scrollY, ppt, pps, size.height]
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();

    // Two fingers = always pinch/zoom, regardless of edit mode
    if (e.touches.length === 2) {
      const t1 = e.touches[0], t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      touchState.current = {
        type: 'pinch', lastX: midX, lastY: midY,
        pinchDist: dist, pinchPpt: ppt,
        startX: midX, startY: midY,
      };
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const tx = e.touches[0].clientX - rect.left;
    const ty = e.touches[0].clientY - rect.top;

    if (!editMode) {
      // Scroll mode
      touchState.current = {
        type: 'scroll', lastX: tx, lastY: ty,
        pinchDist: 0, pinchPpt: 0, startX: tx, startY: ty,
      };
      return;
    }

    // Edit mode
    if (!activeClipId) return;

    if (tool === 'erase') {
      const hit = hitTestNote(tx, ty);
      if (hit) deleteNotes(activeClipId, [hit.note.id]);
      touchState.current = { type: 'none', lastX: 0, lastY: 0, pinchDist: 0, pinchPpt: 0, startX: 0, startY: 0 };
      return;
    }

    const hit = hitTestNote(tx, ty);
    if (hit) {
      if (hit.isResize) {
        touchState.current = {
          type: 'edit-resize', lastX: tx, lastY: ty,
          pinchDist: 0, pinchPpt: 0,
          noteId: hit.note.id, startX: tx, startY: ty,
        };
      } else {
        if (!selectedNoteIds.has(hit.note.id)) {
          setSelectedNoteIds(new Set([hit.note.id]));
        }
        touchState.current = {
          type: 'edit-move', lastX: tx, lastY: ty,
          pinchDist: 0, pinchPpt: 0,
          noteId: hit.note.id, startX: tx, startY: ty,
        };
      }
    } else if (tool === 'draw') {
      const tick = pixelToTick(tx, ppt, scrollX);
      const pitch = yToPitch(ty, pps, scrollY, size.height);
      const snapped = snapTick(tick, snapTickVal);
      addNote(activeClipId, {
        pitch: Math.min(127, Math.max(0, pitch)),
        startTick: Math.max(0, snapped),
        duration: snapTickVal,
        velocity: 80,
        channel: 0,
        pitchBend: [],
      });
      clearSelection();
      touchState.current = {
        type: 'edit-draw', lastX: tx, lastY: ty,
        pinchDist: 0, pinchPpt: 0, startX: tx, startY: ty,
      };
    } else if (tool === 'select') {
      clearSelection();
      touchState.current = {
        type: 'none', lastX: tx, lastY: ty,
        pinchDist: 0, pinchPpt: 0, startX: tx, startY: ty,
      };
    }
  }, [editMode, tool, activeClipId, ppt, pps, scrollX, scrollY, size.height, snapTickVal, notes, selectedNoteIds, hitTestNote, addNote, clearSelection, deleteNotes, setSelectedNoteIds]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const ts = touchState.current;

    // Pinch zoom + pan
    if (ts.type === 'pinch' && e.touches.length === 2) {
      const t1 = e.touches[0], t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      const scale = dist / ts.pinchDist;
      const newPpt = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, ts.pinchPpt * scale));

      const dx = midX - ts.lastX;
      const dy = midY - ts.lastY;

      setViewport({
        pixelsPerTick: newPpt,
        scrollX: Math.max(0, scrollX - dx / newPpt),
        scrollY: Math.max(0, Math.min(115, scrollY + dy / pps)),
      });

      ts.lastX = midX;
      ts.lastY = midY;
      return;
    }

    if (e.touches.length !== 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const tx = e.touches[0].clientX - rect.left;
    const ty = e.touches[0].clientY - rect.top;

    if (ts.type === 'scroll') {
      const dx = tx - ts.lastX;
      const dy = ty - ts.lastY;
      setViewport({
        scrollX: Math.max(0, scrollX - dx / ppt),
        scrollY: Math.max(0, Math.min(115, scrollY + dy / pps)),
      });
      ts.lastX = tx;
      ts.lastY = ty;
      return;
    }

    if (ts.type === 'edit-move' && ts.noteId && activeClipId) {
      const dx = tx - ts.startX;
      const dy = ty - ts.startY;
      const deltaTick = snapTick(dx / ppt, snapTickVal);
      const deltaPitch = -Math.round(dy / pps);
      if (deltaTick !== 0 || deltaPitch !== 0) {
        const ids = selectedNoteIds.has(ts.noteId) ? Array.from(selectedNoteIds) : [ts.noteId];
        moveNotes(activeClipId, ids, deltaTick, deltaPitch);
        ts.startX = tx;
        ts.startY = ty;
      }
    }

    if (ts.type === 'edit-resize' && ts.noteId && activeClipId) {
      const dx = tx - ts.startX;
      const delta = snapTick(dx / ppt, snapTickVal);
      if (delta !== 0) {
        const ids = selectedNoteIds.has(ts.noteId) ? Array.from(selectedNoteIds) : [ts.noteId];
        resizeNotes(activeClipId, ids, delta);
        ts.startX = tx;
      }
    }
  }, [activeClipId, ppt, pps, scrollX, scrollY, snapTickVal, selectedNoteIds, setViewport, moveNotes, resizeNotes]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    // If pinch and one finger lifts, switch remaining to scroll
    if (touchState.current.type === 'pinch' && e.touches.length === 1) {
      const rect = e.currentTarget.getBoundingClientRect();
      touchState.current = {
        type: 'scroll',
        lastX: e.touches[0].clientX - rect.left,
        lastY: e.touches[0].clientY - rect.top,
        pinchDist: 0, pinchPpt: 0, startX: 0, startY: 0,
      };
      return;
    }
    touchState.current = { type: 'none', lastX: 0, lastY: 0, pinchDist: 0, pinchPpt: 0, startX: 0, startY: 0 };
  }, []);

  const canvasWidth = Math.max(0, size.width - KEY_WIDTH);
  const playheadX = tickToPixel(playheadTick, ppt, scrollX);
  const showPlayhead = playheadX >= 0 && playheadX <= canvasWidth;

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        backgroundColor: '#1a1a1c',
        borderTop: editMode ? '2px solid rgba(255, 180, 50, 0.6)' : '2px solid transparent',
        transition: 'border-color 0.2s ease',
      }}
    >
      {/* Fixed piano key column */}
      <MobilePianoKeys
        scrollY={scrollY}
        pixelsPerSemitone={pps}
        canvasHeight={size.height}
        scaleRoot={scaleRoot}
        scaleMode={scaleMode}
      />
      {/* Scrollable canvas area */}
      <div
        style={{ position: 'relative', flex: 1, overflow: 'hidden', touchAction: 'none' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <MobileNoteCanvas
          width={canvasWidth}
          height={size.height}
          scrollX={scrollX}
          scrollY={scrollY}
          pixelsPerTick={ppt}
          pixelsPerSemitone={pps}
          ticksPerBeat={project.ticksPerBeat}
          numerator={ts.numerator}
          notes={notes}
          selectedNoteIds={selectedNoteIds}
          scaleRoot={scaleRoot}
          scaleMode={scaleMode}
        />
        {showPlayhead && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: playheadX,
            width: 1.5,
            height: '100%',
            backgroundColor: isPlaying ? 'rgba(255, 100, 80, 0.8)' : 'rgba(255,255,255,0.25)',
            pointerEvents: 'none',
          }} />
        )}
      </div>
    </div>
  );
};
