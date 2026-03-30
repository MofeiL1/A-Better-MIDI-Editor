import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Grid } from './Grid';
import { NoteLayer } from './NoteLayer';
import { PianoKeys } from './PianoKeys';
import { VelocityLane } from './VelocityLane';
import { Ruler, RULER_HEIGHT } from './Ruler';
import { PlayheadHandle, HANDLE_HEIGHT } from './PlayheadHandle';
import { useProjectStore } from '../../store/projectStore';
import { useUiStore } from '../../store/uiStore';
import { usePreviewNote } from '../../hooks/usePreviewNote';
import { pixelToTick, yToPitch, snapTick, getSnapTicksFromDivision, tickToPixel, tickToSeconds } from '../../utils/timing';
import { analyzeChords, buildChordToneMap, buildMeasureChordMap, detectResolutions } from '../../utils/chordAnalysis';
import { detectKey } from '../../utils/keyDetection';
import type { Note } from '../../types/model';

const DEFAULT_VEL_HEIGHT = 80;
const MIN_VEL_HEIGHT = 30;
const MAX_VEL_HEIGHT = 300;
const VEL_RESIZE_HANDLE = 4;
// Pencil cursor: 16x16 SVG encoded as data URI, hotspot at bottom-left (1,15)
const PENCIL_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath d='M12.1 1.3a1.2 1.2 0 0 1 1.7 0l.9.9a1.2 1.2 0 0 1 0 1.7L5.5 13.1 1.5 14.5l1.4-4L12.1 1.3z' fill='%23ccc' stroke='%23666' stroke-width='.5'/%3E%3Cpath d='M11.2 2.2l2.6 2.6' stroke='%23999' stroke-width='.5' fill='none'/%3E%3C/svg%3E") 1 15, crosshair`;

const PIANO_KEY_WIDTH = 56;
const MIN_ZOOM_X = 0.05;
const MAX_ZOOM_X = 2;

type SelectBox = { x1: number; y1: number; x2: number; y2: number } | null;

export const PianoRoll: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const canvasRect = useRef<DOMRect | null>(null);
  const [size, setSize] = useState({ width: 800, height: 500 });
  const [velHeight, setVelHeight] = useState(DEFAULT_VEL_HEIGHT);
  const [cursor, setCursor] = useState<string>(PENCIL_CURSOR);
  const [selectBox, setSelectBox] = useState<SelectBox>(null);
  const [drawingNoteId, setDrawingNoteId] = useState<string | null>(null);
  const [modifierKeys, setModifierKeys] = useState<{ shift: boolean; cmdCtrl: boolean }>({ shift: false, cmdCtrl: false });

  const project = useProjectStore((s) => s.project);
  const addNote = useProjectStore((s) => s.addNote);
  const drawEditNote = useProjectStore((s) => s.drawEditNote);
  const moveNotes = useProjectStore((s) => s.moveNotes);
  const resizeNotes = useProjectStore((s) => s.resizeNotes);
  const trimNoteStart = useProjectStore((s) => s.trimNoteStart);
  const deleteNotes = useProjectStore((s) => s.deleteNotes);
  const setNoteVelocity = useProjectStore((s) => s.setNoteVelocity);
  const beginDrag = useProjectStore((s) => s.beginDrag);
  const endDrag = useProjectStore((s) => s.endDrag);
  const { previewNote } = usePreviewNote();

  const {
    tool, viewport, selectedNoteIds, snapDivision,
    activeClipId, playheadTick, isPlaying,
    scaleRoot, scaleMode, scaleAutoDetect,
    setViewport, setSelectedNoteIds, clearSelection,
    setActiveClip, setActiveTrack, setPlayheadTick, setScale,
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

  // Track container dimensions
  const [containerSize, setContainerSize] = useState({ width: 800, totalHeight: 600 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ width, totalHeight: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Derive grid size from container minus fixed UI elements
  useEffect(() => {
    const gridHeight = containerSize.totalHeight - velHeight - VEL_RESIZE_HANDLE - RULER_HEIGHT - HANDLE_HEIGHT;
    setSize({ width: containerSize.width, height: Math.max(50, gridHeight) });
  }, [containerSize, velHeight]);

  // Track modifier keys for temporary tool switching
  // Pencil + Shift → Pointer; Pointer + Ctrl/Cmd → Pencil
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  useEffect(() => {
    const update = (e: KeyboardEvent) => {
      setModifierKeys({
        shift: e.shiftKey,
        cmdCtrl: isMac ? e.metaKey : e.ctrlKey,
      });
    };
    const onBlur = () => setModifierKeys({ shift: false, cmdCtrl: false });
    window.addEventListener('keydown', update);
    window.addEventListener('keyup', update);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', update);
      window.removeEventListener('keyup', update);
      window.removeEventListener('blur', onBlur);
    };
  }, [isMac]);

  // Compute effective tool: modifier keys temporarily override base tool
  // Mid-drag safety: drag handlers use dragState.type, not tool, so switching is harmless
  const effectiveTool = (() => {
    if (tool === 'draw' && modifierKeys.shift) return 'select' as const;
    if (tool === 'select' && modifierKeys.cmdCtrl) return 'draw' as const;
    return tool;
  })();

  const activeClip = project.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.id === activeClipId);
  const notes = activeClip?.notes ?? [];

  const ts = project.timeSignatureChanges[0] ?? { numerator: 4, denominator: 4 };
  const snapTicks = getSnapTicksFromDivision(snapDivision, project.ticksPerBeat, ts.numerator ?? 4, ts.denominator ?? 4);
  const bpm = project.tempoChanges[0]?.bpm ?? 120;

  // Chord analysis: per-measure detection with passing tone filter
  const tsNum = ts.numerator ?? 4;
  const tsDen = ts.denominator ?? 4;
  const ticksPerMeasure = project.ticksPerBeat * tsNum * (4 / tsDen);

  const chordToneMap = useMemo(
    () => buildChordToneMap(notes, project.ticksPerBeat, tsNum, tsDen, drawingNoteId),
    [notes, project.ticksPerBeat, tsNum, tsDen, drawingNoteId],
  );

  // Chord analysis for key detection (without Roman numerals — those need scaleRoot which may change)
  const chordsForKeyDetect = useMemo(
    () => analyzeChords(notes, project.ticksPerBeat, tsNum, tsDen),
    [notes, project.ticksPerBeat, tsNum, tsDen],
  );

  // Auto key detection
  const detectedKey = useMemo(
    () => detectKey(notes, chordsForKeyDetect),
    [notes, chordsForKeyDetect],
  );

  // Drive scaleRoot/scaleMode when auto-detect is on
  useEffect(() => {
    if (scaleAutoDetect && detectedKey) {
      setScale(detectedKey.root, detectedKey.mode);
    }
  }, [scaleAutoDetect, detectedKey, setScale]);

  const measureChordMap = useMemo(
    () => buildMeasureChordMap(notes, project.ticksPerBeat, tsNum, tsDen, scaleRoot),
    [notes, project.ticksPerBeat, tsNum, tsDen, scaleRoot],
  );

  // Resolution detection (V→I, ii→V, tritone sub, etc.)
  const resolutions = useMemo(
    () => detectResolutions(chordsForKeyDetect, scaleRoot),
    [chordsForKeyDetect, scaleRoot],
  );

  // drag type extended with trim-start and draw-resize
  const dragState = useRef<{
    type: 'none' | 'draw-resize' | 'move' | 'resize' | 'trim-start' | 'select-box';
    startX: number;
    startY: number;
    noteId?: string;
    noteStartTick?: number;
    notePitch?: number;
    mouseTickOffset?: number; // mouse offset from note start, for absolute move
    mousePitchOffset?: number; // mouse offset from note pitch, for absolute move
    lastPitch?: number; // for preview dedup
  }>({ type: 'none', startX: 0, startY: 0 });

  // Hit test: left-trim zone, resize zone, or body
  const hitTestNote = useCallback(
    (mx: number, my: number): { note: Note; zone: 'body' | 'resize' | 'trim-start' } | null => {
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        const nx = (n.startTick - scrollX) * ppt;
        const nw = n.duration * ppt;
        const ny = size.height - (n.pitch - scrollY + 1) * pps;
        if (mx >= nx && mx <= nx + nw && my >= ny && my <= ny + pps) {
          const handleW = Math.max(6, Math.min(12, nw * 0.2));
          if (mx >= nx + nw - handleW) return { note: n, zone: 'resize' };
          if (mx <= nx + handleW && nw > handleW * 2) return { note: n, zone: 'trim-start' };
          return { note: n, zone: 'body' };
        }
      }
      return null;
    },
    [notes, scrollX, scrollY, ppt, pps, size.height]
  );

  // Middle-click pan: joystick-style scrolling
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button === 1) {
        e.preventDefault();
        const originX = e.clientX;
        const originY = e.clientY;
        let animId = 0;
        let dx = 0;
        let dy = 0;
        const PAN_SPEED = 0.15;

        const panTick = () => {
          const { viewport } = useUiStore.getState();
          setViewport({
            scrollX: Math.max(0, viewport.scrollX + dx * PAN_SPEED / viewport.pixelsPerTick),
            scrollY: Math.max(0, Math.min(115, viewport.scrollY - dy * PAN_SPEED / viewport.pixelsPerSemitone)),
          });
          animId = requestAnimationFrame(panTick);
        };

        const onMove = (ev: MouseEvent) => {
          dx = ev.clientX - originX;
          dy = ev.clientY - originY;
        };
        const onUp = (ev: MouseEvent) => {
          if (ev.button !== 1) return;
          cancelAnimationFrame(animId);
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        animId = requestAnimationFrame(panTick);
        return;
      }

      if (!activeClipId) return;
      const rect = e.currentTarget.getBoundingClientRect();
      canvasRect.current = rect;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const tick = pixelToTick(mx, ppt, scrollX);
      const pitch = yToPitch(my, pps, scrollY, size.height);

      // Register global mouseup so drag always ends, even if mouse leaves canvas
      const globalMouseUp = (ev: MouseEvent) => {
        document.removeEventListener('mouseup', globalMouseUp);
        // Simulate the same cleanup as handleMouseUp
        const ds = dragState.current;
        if (ds.type === 'select-box' && canvasRect.current) {
          const umx = ev.clientX - canvasRect.current.left;
          const umy = ev.clientY - canvasRect.current.top;
          const x1 = Math.min(ds.startX, umx);
          const x2 = Math.max(ds.startX, umx);
          const y1 = Math.min(ds.startY, umy);
          const y2 = Math.max(ds.startY, umy);
          const { viewport, selectedNoteIds: selIds } = useUiStore.getState();
          const currentNotes = useProjectStore.getState().project.tracks
            .flatMap((t) => t.clips).flatMap((c) => c.notes);
          const boxSelected = new Set<string>();
          for (const n of currentNotes) {
            const nx = (n.startTick - viewport.scrollX) * viewport.pixelsPerTick;
            const nw = n.duration * viewport.pixelsPerTick;
            const ny = size.height - (n.pitch - viewport.scrollY + 1) * viewport.pixelsPerSemitone;
            if (nx + nw >= x1 && nx <= x2 && ny + viewport.pixelsPerSemitone >= y1 && ny <= y2) {
              boxSelected.add(n.id);
            }
          }
          const selected = ev.shiftKey
            ? new Set([...selIds, ...boxSelected])
            : boxSelected;
          setSelectedNoteIds(selected);
        }
        setSelectBox(null);
        setDrawingNoteId(null);
        dragState.current = { type: 'none', startX: 0, startY: 0 };
        endDrag();
      };
      document.addEventListener('mouseup', globalMouseUp);

      if (effectiveTool === 'draw') {
        const hit = hitTestNote(mx, my);
        if (hit) {
          beginDrag();
          if (hit.zone === 'resize') {
            dragState.current = { type: 'resize', startX: mx, startY: my, noteId: hit.note.id, noteStartTick: hit.note.startTick };
          } else if (hit.zone === 'trim-start') {
            dragState.current = { type: 'trim-start', startX: mx, startY: my, noteId: hit.note.id, noteStartTick: hit.note.startTick };
          } else {
            if (!selectedNoteIds.has(hit.note.id)) {
              setSelectedNoteIds(e.shiftKey ? new Set([...selectedNoteIds, hit.note.id]) : new Set([hit.note.id]));
            }
            previewNote(hit.note.pitch, tickToSeconds(hit.note.duration, bpm, project.ticksPerBeat), hit.note.velocity);
            const noteTick = hit.note.startTick;
            const notePitch = hit.note.pitch;
            const mouseTick = pixelToTick(mx, ppt, scrollX);
            const mousePitch = yToPitch(my, pps, scrollY, size.height);
            dragState.current = {
              type: 'move', startX: mx, startY: my, noteId: hit.note.id,
              noteStartTick: noteTick, notePitch,
              mouseTickOffset: mouseTick - noteTick,
              mousePitchOffset: mousePitch - notePitch,
              lastPitch: notePitch,
            };
          }
        } else if (selectedNoteIds.size > 0) {
          // In pencil mode, clicking empty space with selection → deselect first
          clearSelection();
        } else {
          // beginDrag first so addNote skips its own pushUndo — the whole gesture is one undo step
          beginDrag();
          const snappedTick = snapTick(tick, snapTicks, ticksPerMeasure);
          const clampedPitch = Math.min(127, Math.max(0, Math.round(pitch)));
          const newNoteId = addNote(activeClipId, {
            pitch: clampedPitch,
            startTick: Math.max(0, snappedTick),
            duration: snapTicks,
            velocity: 80,
            channel: 0,
            pitchBend: [],
          });
          previewNote(clampedPitch, tickToSeconds(snapTicks, bpm, project.ticksPerBeat), 80);
          clearSelection();
          setDrawingNoteId(newNoteId);
          dragState.current = {
            type: 'draw-resize',
            startX: mx, startY: my,
            noteId: newNoteId,
            noteStartTick: Math.max(0, snappedTick),
            notePitch: clampedPitch,
            lastPitch: clampedPitch,
          };
        }
      } else if (effectiveTool === 'select') {
        const hit = hitTestNote(mx, my);
        if (hit) {
          beginDrag();
          if (hit.zone === 'resize') {
            dragState.current = { type: 'resize', startX: mx, startY: my, noteId: hit.note.id, noteStartTick: hit.note.startTick };
          } else if (hit.zone === 'trim-start') {
            dragState.current = { type: 'trim-start', startX: mx, startY: my, noteId: hit.note.id, noteStartTick: hit.note.startTick };
          } else {
            if (e.shiftKey) {
              const next = new Set(selectedNoteIds);
              if (next.has(hit.note.id)) next.delete(hit.note.id); else next.add(hit.note.id);
              setSelectedNoteIds(next);
            } else if (!selectedNoteIds.has(hit.note.id)) {
              setSelectedNoteIds(new Set([hit.note.id]));
            }
            previewNote(hit.note.pitch, tickToSeconds(hit.note.duration, bpm, project.ticksPerBeat), hit.note.velocity);
            const noteTick = hit.note.startTick;
            const notePitch = hit.note.pitch;
            const mouseTick = pixelToTick(mx, ppt, scrollX);
            const mousePitch = yToPitch(my, pps, scrollY, size.height);
            dragState.current = {
              type: 'move', startX: mx, startY: my, noteId: hit.note.id,
              noteStartTick: noteTick, notePitch,
              mouseTickOffset: mouseTick - noteTick,
              mousePitchOffset: mousePitch - notePitch,
              lastPitch: notePitch,
            };
          }
        } else {
          beginDrag();
          if (!e.shiftKey) clearSelection();
          dragState.current = { type: 'select-box', startX: mx, startY: my };
          setSelectBox({ x1: mx, y1: my, x2: mx, y2: my });
        }
      } else if (effectiveTool === 'erase') {
        const hit = hitTestNote(mx, my);
        if (hit) deleteNotes(activeClipId, [hit.note.id]);
      }
    },
    [effectiveTool, activeClipId, ppt, pps, scrollX, scrollY, size.height, snapTicks, notes, selectedNoteIds, hitTestNote, addNote, drawEditNote, beginDrag, clearSelection, deleteNotes, setSelectedNoteIds, previewNote]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const ds = dragState.current;

      if (ds.type === 'none') {
        // Update cursor and hover highlight
        const hit = hitTestNote(mx, my);
        useUiStore.getState().setHoveredNoteId(hit?.note.id ?? null);
        if (hit?.zone === 'resize' || hit?.zone === 'trim-start') {
          setCursor('ew-resize');
        } else if (hit) {
          setCursor(effectiveTool === 'erase' ? 'not-allowed' : 'grab');
        } else {
          // In draw mode with selection, empty space click will deselect → show default cursor
          const drawButWillDeselect = effectiveTool === 'draw' && selectedNoteIds.size > 0;
          setCursor(effectiveTool === 'draw' && !drawButWillDeselect ? PENCIL_CURSOR : 'default');
        }
        return;
      }

      if (ds.type === 'select-box') {
        setSelectBox({ x1: ds.startX, y1: ds.startY, x2: mx, y2: my });
        return;
      }

      if (!activeClipId) return;

      if (ds.type === 'draw-resize' && ds.noteId && ds.noteStartTick !== undefined) {
        const currentTick = pixelToTick(mx, ppt, scrollX);
        const newDuration = Math.max(snapTicks, snapTick(currentTick - ds.noteStartTick, snapTicks, ticksPerMeasure));
        const rawPitch = yToPitch(my, pps, scrollY, size.height);
        const newPitch = Math.min(127, Math.max(0, Math.round(rawPitch)));
        const note = notes.find((n) => n.id === ds.noteId);
        if (note && (newDuration !== note.duration || newPitch !== note.pitch)) {
          drawEditNote(activeClipId, ds.noteId, newPitch, newDuration);
          if (newPitch !== ds.lastPitch) {
            previewNote(newPitch, tickToSeconds(newDuration, bpm, project.ticksPerBeat), note.velocity);
            ds.lastPitch = newPitch;
          }
        }
        return;
      }

      if (ds.type === 'move' && ds.noteId && ds.noteStartTick !== undefined && ds.mouseTickOffset !== undefined && ds.mousePitchOffset !== undefined) {
        // Absolute move: compute target from current mouse position minus the recorded offset
        const currentMouseTick = pixelToTick(mx, ppt, scrollX);
        const currentMousePitch = yToPitch(my, pps, scrollY, size.height);
        const targetTick = Math.max(0, snapTick(currentMouseTick - ds.mouseTickOffset, snapTicks, ticksPerMeasure));
        const targetPitch = Math.round(currentMousePitch - ds.mousePitchOffset);

        const note = notes.find((n) => n.id === ds.noteId);
        if (note) {
          const deltaTick = targetTick - note.startTick;
          const deltaPitch = Math.min(127, Math.max(0, targetPitch)) - note.pitch;
          if (deltaTick !== 0 || deltaPitch !== 0) {
            const idsToMove = selectedNoteIds.has(ds.noteId) ? Array.from(selectedNoteIds) : [ds.noteId];
            moveNotes(activeClipId, idsToMove, deltaTick, deltaPitch);
            // Preview if pitch changed — full duration, actual velocity, stops previous
            if (deltaPitch !== 0) {
              const newPitch = note.pitch + deltaPitch;
              if (newPitch !== ds.lastPitch) {
                previewNote(newPitch, tickToSeconds(note.duration, bpm, project.ticksPerBeat), note.velocity);
                ds.lastPitch = newPitch;
              }
            }
          }
        }
      } else if (ds.type === 'resize' && ds.noteId && ds.noteStartTick !== undefined) {
        const currentTick = pixelToTick(mx, ppt, scrollX);
        const newDuration = Math.max(snapTicks, snapTick(currentTick - ds.noteStartTick, snapTicks, ticksPerMeasure));
        const note = notes.find((n) => n.id === ds.noteId);
        if (note) {
          const delta = newDuration - note.duration;
          if (delta !== 0) {
            const idsToResize = selectedNoteIds.has(ds.noteId) ? Array.from(selectedNoteIds) : [ds.noteId];
            resizeNotes(activeClipId, idsToResize, delta);
          }
        }
      } else if (ds.type === 'trim-start' && ds.noteId && ds.noteStartTick !== undefined) {
        // Trim start: mouse position → new startTick, duration shrinks correspondingly
        const currentTick = pixelToTick(mx, ppt, scrollX);
        const newStartTick = snapTick(currentTick, snapTicks, ticksPerMeasure);
        const note = notes.find((n) => n.id === ds.noteId);
        if (note) {
          const delta = newStartTick - note.startTick;
          if (delta !== 0) {
            const ids = selectedNoteIds.has(ds.noteId) ? Array.from(selectedNoteIds) : [ds.noteId];
            trimNoteStart(activeClipId, ids, delta);
          }
        }
      }
    },
    [activeClipId, ppt, pps, scrollX, scrollY, size.height, snapTicks, selectedNoteIds, notes, drawEditNote, moveNotes, resizeNotes, trimNoteStart, hitTestNote, effectiveTool, previewNote]
  );

  const handleMouseLeave = useCallback(() => {
    setCursor(effectiveTool === 'draw' ? PENCIL_CURSOR : 'default');
    useUiStore.getState().setHoveredNoteId(null);
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const newPpt = Math.max(MIN_ZOOM_X, Math.min(MAX_ZOOM_X, ppt * factor));
        const playheadPx = (playheadTick - scrollX) * ppt;
        const newScrollX = Math.max(0, playheadTick - playheadPx / newPpt);
        setViewport({ pixelsPerTick: newPpt, scrollX: newScrollX });
      } else if (e.shiftKey) {
        setViewport({ scrollX: Math.max(0, scrollX + e.deltaY / ppt) });
      } else {
        // Handle both deltaX (horizontal) and deltaY (vertical) for trackpad two-finger scroll
        const newScrollX = Math.max(0, scrollX + e.deltaX / ppt);
        const newScrollY = Math.max(0, Math.min(115, scrollY - e.deltaY / pps));
        setViewport({ scrollX: newScrollX, scrollY: newScrollY });
      }
    },
    [ppt, pps, scrollX, scrollY, playheadTick, setViewport]
  );

  // Register native wheel handler with passive: false to allow preventDefault
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleVelocityChange = useCallback(
    (noteId: string, velocity: number) => {
      if (!activeClipId) return;
      setNoteVelocity(activeClipId, [noteId], velocity);
    },
    [activeClipId, setNoteVelocity]
  );

  // Ruler click → set playhead snapped to snap division
  const handleSetPlayhead = useCallback(
    (tick: number) => {
      const snapped = snapTick(tick, snapTicks, ticksPerMeasure);
      setPlayheadTick(Math.max(0, snapped));
    },
    [snapTicks, setPlayheadTick]
  );

  const gridWidth = size.width - PIANO_KEY_WIDTH;
  const playheadX = tickToPixel(playheadTick, ppt, scrollX);
  const showPlayhead = playheadX >= 0 && playheadX <= gridWidth;

  const sbDisplay = selectBox
    ? {
        left: Math.min(selectBox.x1, selectBox.x2),
        top: Math.min(selectBox.y1, selectBox.y2),
        width: Math.abs(selectBox.x2 - selectBox.x1),
        height: Math.abs(selectBox.y2 - selectBox.y1),
      }
    : null;

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#242424', overflow: 'hidden' }}
    >
      {/* Ruler row */}
      <div style={{ display: 'flex' }}>
        <div style={{ width: PIANO_KEY_WIDTH, flexShrink: 0, backgroundColor: '#2a2a2a', borderBottom: '1px solid #1a1a1a', borderRight: '2px solid #555' }} />
        <Ruler
          width={gridWidth}
          height={RULER_HEIGHT}
          scrollX={scrollX}
          pixelsPerTick={ppt}
          ticksPerBeat={project.ticksPerBeat}
          numerator={ts.numerator}
          denominator={ts.denominator ?? 4}
          playheadTick={playheadTick}
          snapTicks={snapTicks}
          onSetPlayhead={handleSetPlayhead}
        />
      </div>

      {/* Main grid area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <PianoKeys
          scrollY={scrollY}
          pixelsPerSemitone={pps}
          canvasHeight={size.height}
        />
        <div
          ref={gridContainerRef}
          style={{ position: 'relative', flex: 1, overflow: 'hidden' }}
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
          denominator={ts.denominator ?? 4}
            snapDivision={snapDivision}
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
            chordToneMap={chordToneMap}
            measureChordMap={measureChordMap}
            ticksPerMeasure={ticksPerMeasure}
            scaleRoot={scaleRoot}
            scaleMode={scaleMode}
            resolutions={resolutions}
            cursor={cursor}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          />

          {/* Selection box overlay */}
          {sbDisplay && sbDisplay.width > 2 && sbDisplay.height > 2 && (
            <div
              style={{
                position: 'absolute',
                left: sbDisplay.left,
                top: sbDisplay.top,
                width: sbDisplay.width,
                height: sbDisplay.height,
                border: '1px solid rgba(100, 160, 255, 0.8)',
                backgroundColor: 'rgba(100, 160, 255, 0.08)',
                pointerEvents: 'none',
                zIndex: 20,
              }}
            />
          )}

          {/* Playhead line */}
          {showPlayhead && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: playheadX,
                width: 1,
                height: size.height,
                backgroundColor: isPlaying ? '#fff' : 'rgba(255, 255, 255, 0.3)',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            />
          )}
        </div>
      </div>

      {/* Playhead handle strip — mirrors top ruler triangle, draggable */}
      <div style={{ display: 'flex' }}>
        <div style={{ width: PIANO_KEY_WIDTH, flexShrink: 0, backgroundColor: '#1e1e1e', borderRight: '2px solid #555' }} />
        <PlayheadHandle
          width={gridWidth}
          scrollX={scrollX}
          pixelsPerTick={ppt}
          ticksPerBeat={project.ticksPerBeat}
          numerator={ts.numerator}
          denominator={ts.denominator ?? 4}
          playheadTick={playheadTick}
          snapTicks={snapTicks}
          onSetPlayhead={handleSetPlayhead}
        />
      </div>

      {/* Velocity resize handle */}
      <div
        style={{ height: VEL_RESIZE_HANDLE, cursor: 'ns-resize', backgroundColor: '#1a1a1a', borderTop: '1px solid #333' }}
        onMouseDown={(e) => {
          e.preventDefault();
          const startY = e.clientY;
          const startH = velHeight;
          const onMove = (ev: MouseEvent) => {
            const delta = startY - ev.clientY;
            setVelHeight(Math.max(MIN_VEL_HEIGHT, Math.min(MAX_VEL_HEIGHT, startH + delta)));
          };
          const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        }}
      />

      {/* Velocity lane */}
      <div style={{ display: 'flex' }}>
        <div style={{ width: PIANO_KEY_WIDTH, flexShrink: 0, backgroundColor: '#1e1e1e', borderRight: '2px solid #555' }} />
        <VelocityLane
          width={gridWidth}
          height={velHeight}
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
