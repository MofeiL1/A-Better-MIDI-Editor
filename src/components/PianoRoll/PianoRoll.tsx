import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Grid } from './Grid';
import { NoteLayer } from './NoteLayer';
import { PianoKeys } from './PianoKeys';
import { VelocityLane } from './VelocityLane';
import { Ruler, RULER_HEIGHT } from './Ruler';
import { PlayheadHandle, HANDLE_HEIGHT } from './PlayheadHandle';
import { ChordTrack } from './ChordTrack';
import { KeyStrip } from './KeyStrip';
import { analyzeTonalSegments } from '../../utils/tonalSegmentation';
import { useProjectStore } from '../../store/projectStore';
import { useUiStore } from '../../store/uiStore';
import { usePreviewNote } from '../../hooks/usePreviewNote';
import { pixelToTick, yToPitch, snapTick, getSnapTicksFromDivision, getSmartSnapTicks, tickToPixel, tickToSeconds } from '../../utils/timing';
import { detectResolutions } from '../../utils/chordAnalysis';
import { detectChordsFromNotes, buildOverlapChordToneMap, buildChordLabels, toChordInfoForKeyDetect } from '../../utils/chordDetection';
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
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const [velHeight, setVelHeight] = useState(DEFAULT_VEL_HEIGHT);
  const [cursor, setCursor] = useState<string>(PENCIL_CURSOR);
  const [selectBox, setSelectBox] = useState<SelectBox>(null);
  const [drawingNoteId, setDrawingNoteId] = useState<string | null>(null);
  const [modifierKeys, setModifierKeys] = useState<{ shift: boolean; cmdCtrl: boolean }>({ shift: false, cmdCtrl: false });
  const [ghostNotes, setGhostNotes] = useState<{ pitch: number; startTick: number; duration: number; velocity: number }[]>([]);
  const [ghostCopyMode, setGhostCopyMode] = useState(false);

  const project = useProjectStore((s) => s.project);
  const addNote = useProjectStore((s) => s.addNote);
  const drawEditNote = useProjectStore((s) => s.drawEditNote);
  const moveNotes = useProjectStore((s) => s.moveNotes);
  const resizeNotes = useProjectStore((s) => s.resizeNotes);
  const trimNoteStart = useProjectStore((s) => s.trimNoteStart);
  const deleteNotes = useProjectStore((s) => s.deleteNotes);
  const pasteNotes = useProjectStore((s) => s.pasteNotes);
  const setNoteVelocity = useProjectStore((s) => s.setNoteVelocity);
  const beginDrag = useProjectStore((s) => s.beginDrag);
  const endDrag = useProjectStore((s) => s.endDrag);
  const { previewNote } = usePreviewNote();

  const {
    tool, viewport, selectedNoteIds, snapDivision,
    activeClipId, playheadTick, isPlaying,
    lastDrawnDuration, useJazzSymbols,
    setViewport, setSelectedNoteIds, clearSelection,
    setActiveClip, setActiveTrack, setPlayheadTick,
    setLastDrawnDuration,
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
      // Update ghost copy mode based on Alt during move drag
      if (dragState.current.type === 'move') {
        setGhostCopyMode(e.altKey);
      }
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
  const snapTicks = snapDivision === 'smart'
    ? getSmartSnapTicks(ppt, project.ticksPerBeat, ts.numerator ?? 4, ts.denominator ?? 4)
    : getSnapTicksFromDivision(snapDivision, project.ticksPerBeat, ts.numerator ?? 4, ts.denominator ?? 4);
  const bpm = project.tempoChanges[0]?.bpm ?? 120;

  // Chord analysis: per-measure detection with passing tone filter
  const tsNum = ts.numerator ?? 4;
  const tsDen = ts.denominator ?? 4;
  const ticksPerMeasure = project.ticksPerBeat * tsNum * (4 / tsDen);

  // Overlap-based chord tone map (replaces per-measure buildChordToneMap)
  const chordToneMap = useMemo(
    () => buildOverlapChordToneMap(notes, project.ticksPerBeat, drawingNoteId),
    [notes, project.ticksPerBeat, drawingNoteId],
  );

  // Overlap-based chord detection (used for key detection, labels, duration bars)
  const detectedChords = useMemo(
    () => detectChordsFromNotes(notes, project.ticksPerBeat),
    [notes, project.ticksPerBeat],
  );

  // Convert to ChordInfo for key detection
  const chordsForKeyDetect = useMemo(
    () => toChordInfoForKeyDetect(notes, project.ticksPerBeat),
    [notes, project.ticksPerBeat],
  );

  // Tonal segmentation: per-bar key regions with probabilities
  const tonalResult = useMemo(() => {
    if (notes.length === 0) return null;
    const simpleNotes = notes.map((n) => ({
      pitch: n.pitch,
      startTick: n.startTick,
      duration: n.duration,
    }));
    return analyzeTonalSegments(simpleNotes, project.ticksPerBeat);
  }, [notes, project.ticksPerBeat]);

  // Derive global key from tonal segmentation
  const scaleRoot = tonalResult?.globalRanking[0]?.root ?? 0;
  const scaleMode = tonalResult?.globalRanking[0]?.mode ?? 'major';
  const tonalRegions = tonalResult?.regions ?? [];

  // Sync global key to uiStore for PianoKeys root highlighting
  const setScale = useUiStore((s) => s.setScale);
  useEffect(() => {
    setScale(scaleRoot, scaleMode);
  }, [scaleRoot, scaleMode, setScale]);

  // Chord labels (roman numerals for NoteLayer) — uses per-region key
  const chordLabels = useMemo(
    () => buildChordLabels(notes, project.ticksPerBeat, scaleRoot, tonalRegions),
    [notes, project.ticksPerBeat, scaleRoot, tonalRegions],
  );

  // Resolution detection (V→I, ii→V, tritone sub, etc.)
  const resolutions = useMemo(
    () => detectResolutions(chordsForKeyDetect, scaleRoot),
    [chordsForKeyDetect, scaleRoot],
  );

  // ChordTrack drag handlers
  const handleChordResizeEnd = useCallback((_chordId: string, memberNoteIds: string[], deltaTicks: number) => {
    if (!activeClipId || memberNoteIds.length === 0) return;
    resizeNotes(activeClipId, memberNoteIds, deltaTicks);
  }, [activeClipId, resizeNotes]);

  const handleChordTrimStart = useCallback((_chordId: string, memberNoteIds: string[], deltaTicks: number) => {
    if (!activeClipId || memberNoteIds.length === 0) return;
    trimNoteStart(activeClipId, memberNoteIds, deltaTicks);
  }, [activeClipId, trimNoteStart]);

  const handleSelectChordNotes = useCallback((noteIds: string[], addToSelection: boolean) => {
    if (addToSelection) {
      const next = new Set(selectedNoteIds);
      for (const id of noteIds) next.add(id);
      setSelectedNoteIds(next);
    } else {
      setSelectedNoteIds(new Set(noteIds));
    }
  }, [selectedNoteIds, setSelectedNoteIds]);

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
        // Alt+drag copy: if Alt still held at mouseUp and we did a move,
        // paste copies of selected notes at their original (pre-move) positions
        if (ds.type === 'move' && ev.altKey) {
          const { activeClipId: clipId } = useUiStore.getState();
          if (clipId) {
            const clip = useProjectStore.getState().project.tracks
              .flatMap((t) => t.clips).find((c) => c.id === clipId);
            const selIds = useUiStore.getState().selectedNoteIds;
            if (clip) {
              const movedNotes = clip.notes.filter((n) => selIds.has(n.id));
              if (movedNotes.length > 0 && ds.noteStartTick !== undefined && ds.notePitch !== undefined) {
                const currentNote = movedNotes.find((n) => n.id === ds.noteId);
                if (currentNote) {
                  const deltaTick = currentNote.startTick - ds.noteStartTick;
                  const deltaPitch = currentNote.pitch - ds.notePitch;
                  // Only copy if notes actually moved (prevent in-place duplication)
                  if (deltaTick !== 0 || deltaPitch !== 0) {
                    const copies = movedNotes.map(({ id: _, ...rest }) => ({
                      ...rest,
                      startTick: rest.startTick - deltaTick,
                      pitch: rest.pitch - deltaPitch,
                    }));
                    const earliestTick = Math.min(...copies.map((n) => n.startTick));
                    pasteNotes(clipId, copies, earliestTick);
                  }
                }
              }
            }
          }
        }

        // Save drawn note duration for next pencil note
        const ds2 = dragState.current;
        if (ds2.type === 'draw-resize' && ds2.noteId) {
          const drawnNote = useProjectStore.getState().project.tracks
            .flatMap((t) => t.clips).flatMap((c) => c.notes)
            .find((n) => n.id === ds2.noteId);
          if (drawnNote && drawnNote.duration > 0) {
            setLastDrawnDuration(drawnNote.duration);
          }
        }
        setSelectBox(null);
        setDrawingNoteId(null);
        setGhostNotes([]);
        setGhostCopyMode(false);
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
            duration: lastDrawnDuration,
            velocity: 80,
            channel: 0,
            pitchBend: [],
          });
          previewNote(clampedPitch, tickToSeconds(lastDrawnDuration, bpm, project.ticksPerBeat), 80);
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

            // Always capture ghost notes at original positions during move drag
            if (activeClipId) {
              const currentSelIds = selectedNoteIds.has(hit.note.id) ? selectedNoteIds : new Set([hit.note.id]);
              const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === activeClipId);
              if (clip) {
                setGhostNotes(clip.notes
                  .filter((n) => currentSelIds.has(n.id))
                  .map((n) => ({ pitch: n.pitch, startTick: n.startTick, duration: n.duration, velocity: n.velocity })));
              }
            }
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
        // Duration: 1:1 relative offset from click point applied to note end.
        // Mouse delta (px) → tick delta → add to initial duration.
        const dx = mx - ds.startX;
        const deltaTicks = dx / ppt;
        const snappedDelta = Math.round(deltaTicks / snapTicks) * snapTicks;
        const newDuration = Math.max(snapTicks, lastDrawnDuration + snappedDelta);
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
        // Update ghost style based on Alt key
        setGhostCopyMode(e.altKey);
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

  // Touch: GarageBand-style — tap note to select, drag to move/resize, tap empty to scroll
  // Expanded hit area (+8px) for fat fingers, 10px deadzone before committing to drag/scroll
  const TOUCH_PAD = 12; // extra px around notes for touch hit
  const TOUCH_DEADZONE = 10; // px movement before action starts

  const touchState = useRef<{
    phase: 'pending' | 'active';
    startX: number;
    startY: number;
    hit: { note: Note; zone: 'body' | 'resize' | 'trim-start' } | null;
    mode: 'scroll' | 'move' | 'resize' | 'trim-start';
    noteId?: string;
    noteStartTick?: number;
    mouseTickOffset?: number;
    mousePitchOffset?: number;
  } | null>(null);

  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;

    // Touch hit test with expanded area
    const touchHitTest = (mx: number, my: number, canvasH: number, vp: { scrollX: number; scrollY: number; pixelsPerTick: number; pixelsPerSemitone: number }, clipNotes: Note[]): { note: Note; zone: 'body' | 'resize' | 'trim-start' } | null => {
      for (let i = clipNotes.length - 1; i >= 0; i--) {
        const n = clipNotes[i];
        const nx = (n.startTick - vp.scrollX) * vp.pixelsPerTick;
        const nw = n.duration * vp.pixelsPerTick;
        const ny = canvasH - (n.pitch - vp.scrollY + 1) * vp.pixelsPerSemitone;
        const nh = vp.pixelsPerSemitone;
        // Expanded hit area
        if (mx >= nx - TOUCH_PAD && mx <= nx + nw + TOUCH_PAD && my >= ny - TOUCH_PAD && my <= ny + nh + TOUCH_PAD) {
          const handleW = Math.max(8, Math.min(16, nw * 0.15)); // touch handles: bigger than mouse but body stays dominant
          if (mx >= nx + nw - handleW) return { note: n, zone: 'resize' };
          if (mx <= nx + handleW && nw > handleW * 2) return { note: n, zone: 'trim-start' };
          return { note: n, zone: 'body' };
        }
      }
      return null;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      const rect = el.getBoundingClientRect();
      const mx = touch.clientX - rect.left;
      const my = touch.clientY - rect.top;
      const vp = useUiStore.getState().viewport;
      const clip = useProjectStore.getState().project.tracks
        .flatMap((t) => t.clips).find((c) => c.id === useUiStore.getState().activeClipId);
      const hit = clip ? touchHitTest(mx, my, sizeRef.current.height, vp, clip.notes) : null;

      // Don't commit yet — wait for deadzone
      touchState.current = {
        phase: 'pending',
        startX: touch.clientX, startY: touch.clientY,
        hit,
        mode: hit ? (hit.zone === 'body' ? 'move' : hit.zone) : 'scroll',
      };
    };

    const activateDrag = (ts: NonNullable<typeof touchState.current>) => {
      ts.phase = 'active';
      if (ts.hit) {
        // Select the note
        const selIds = useUiStore.getState().selectedNoteIds;
        if (!selIds.has(ts.hit.note.id)) {
          useUiStore.getState().setSelectedNoteIds(new Set([ts.hit.note.id]));
        }
        useProjectStore.getState().beginDrag();
        ts.noteId = ts.hit.note.id;
        ts.noteStartTick = ts.hit.note.startTick;
        if (ts.mode === 'move') {
          const rect = el.getBoundingClientRect();
          const mx = ts.startX - rect.left;
          const my = ts.startY - rect.top;
          const vp = useUiStore.getState().viewport;
          ts.mouseTickOffset = pixelToTick(mx, vp.pixelsPerTick, vp.scrollX) - ts.hit.note.startTick;
          ts.mousePitchOffset = yToPitch(my, vp.pixelsPerSemitone, vp.scrollY, sizeRef.current.height) - ts.hit.note.pitch;
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !touchState.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      const ts = touchState.current;

      // Deadzone check
      if (ts.phase === 'pending') {
        const dist = Math.hypot(touch.clientX - ts.startX, touch.clientY - ts.startY);
        if (dist < TOUCH_DEADZONE) return;
        activateDrag(ts);
      }

      const rect = el.getBoundingClientRect();
      const mx = touch.clientX - rect.left;
      const my = touch.clientY - rect.top;
      const vp = useUiStore.getState().viewport;

      if (ts.mode === 'scroll') {
        const dx = touch.clientX - ts.startX;
        const dy = touch.clientY - ts.startY;
        ts.startX = touch.clientX;
        ts.startY = touch.clientY;
        useUiStore.getState().setViewport({
          scrollX: Math.max(0, vp.scrollX - dx / vp.pixelsPerTick),
          scrollY: Math.max(0, Math.min(115, vp.scrollY + dy / vp.pixelsPerSemitone)),
        });
        return;
      }

      const clipId = useUiStore.getState().activeClipId;
      const store = useProjectStore.getState();
      const clip = clipId ? store.project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId) : null;
      if (!clip || !clipId || !ts.noteId) return;
      const selIds = useUiStore.getState().selectedNoteIds;
      const ids = selIds.has(ts.noteId) ? Array.from(selIds) : [ts.noteId];
      // Compute snap fresh from store (not from stale closure)
      const uiState = useUiStore.getState();
      const proj = useProjectStore.getState().project;
      const tsig = proj.timeSignatureChanges[0] ?? { numerator: 4, denominator: 4 };
      const tpm = proj.ticksPerBeat * (tsig.numerator ?? 4) * (4 / (tsig.denominator ?? 4));
      const sn = uiState.snapDivision === 'smart'
        ? getSmartSnapTicks(vp.pixelsPerTick, proj.ticksPerBeat, tsig.numerator ?? 4, tsig.denominator ?? 4)
        : getSnapTicksFromDivision(uiState.snapDivision, proj.ticksPerBeat, tsig.numerator ?? 4, tsig.denominator ?? 4);

      if (ts.mode === 'move' && ts.noteStartTick !== undefined && ts.mouseTickOffset !== undefined && ts.mousePitchOffset !== undefined) {
        const curTick = pixelToTick(mx, vp.pixelsPerTick, vp.scrollX);
        const curPitch = yToPitch(my, vp.pixelsPerSemitone, vp.scrollY, sizeRef.current.height);
        const targetTick = Math.max(0, snapTick(curTick - ts.mouseTickOffset, sn, tpm));
        const targetPitch = Math.round(curPitch - ts.mousePitchOffset);
        const note = clip.notes.find((n) => n.id === ts.noteId);
        if (note) {
          const dt = targetTick - note.startTick;
          const dp = Math.min(127, Math.max(0, targetPitch)) - note.pitch;
          if (dt !== 0 || dp !== 0) store.moveNotes(clipId, ids, dt, dp);
        }
      } else if (ts.mode === 'resize' && ts.noteStartTick !== undefined) {
        const curTick = pixelToTick(mx, vp.pixelsPerTick, vp.scrollX);
        const newDur = Math.max(sn, Math.round((curTick - ts.noteStartTick) / sn) * sn);
        const note = clip.notes.find((n) => n.id === ts.noteId);
        if (note) {
          const delta = newDur - note.duration;
          if (delta !== 0) store.resizeNotes(clipId, ids, delta);
        }
      } else if (ts.mode === 'trim-start') {
        const curTick = pixelToTick(mx, vp.pixelsPerTick, vp.scrollX);
        const newStart = snapTick(curTick, sn, tpm);
        const note = clip.notes.find((n) => n.id === ts.noteId);
        if (note) {
          const delta = newStart - note.startTick;
          if (delta !== 0) store.trimNoteStart(clipId, ids, delta);
        }
      }
    };

    const onTouchEnd = () => {
      const ts = touchState.current;
      if (ts) {
        if (ts.phase === 'pending' && ts.hit) {
          // Tap without drag: just select the note
          useUiStore.getState().setSelectedNoteIds(new Set([ts.hit.note.id]));
        } else if (ts.phase === 'pending' && !ts.hit) {
          // Tap empty: deselect
          useUiStore.getState().clearSelection();
        } else if (ts.phase === 'active' && ts.mode !== 'scroll') {
          useProjectStore.getState().endDrag();
        }
      }
      touchState.current = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

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

      {/* Key Strip row */}
      <div style={{ display: 'flex' }}>
        <div style={{ width: PIANO_KEY_WIDTH, flexShrink: 0, backgroundColor: '#1a1a1e', borderRight: '2px solid #555', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 8, color: '#666', fontFamily: '-apple-system, "SF Pro Text", sans-serif', letterSpacing: 0.5 }}>KEY</span>
        </div>
        <KeyStrip
          width={gridWidth}
          height={Math.max(14, pps - 2)}
          scrollX={scrollX}
          pixelsPerTick={ppt}
          regions={tonalResult?.regions ?? []}
          isAtonal={tonalResult?.isLikelyAtonal ?? false}
        />
      </div>

      {/* Chord Track row */}
      <div style={{ display: 'flex' }}>
        <div style={{ width: PIANO_KEY_WIDTH, flexShrink: 0, backgroundColor: '#1e1e1e', borderRight: '2px solid #555' }} />
        <ChordTrack
          width={gridWidth}
          height={pps}
          scrollX={scrollX}
          pixelsPerTick={ppt}
          snapTicks={snapTicks}
          chords={detectedChords}
          onResizeEnd={handleChordResizeEnd}
          onTrimStart={handleChordTrimStart}
          onDragBegin={beginDrag}
          onDragEnd={endDrag}
          useJazzSymbols={useJazzSymbols}
          selectedNoteIds={selectedNoteIds}
          onSelectChordNotes={handleSelectChordNotes}
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
            snapTicks={snapTicks}
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
            chordLabels={chordLabels}
            scaleRoot={scaleRoot}
            scaleMode={scaleMode}
            tonalRegions={tonalRegions}
            resolutions={resolutions}
            ticksPerMeasure={ticksPerMeasure}
            useJazzSymbols={useJazzSymbols}
            ghostNotes={ghostNotes}
            ghostCopyMode={ghostCopyMode}
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
