import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Grid } from './Grid';
import { NoteLayer } from './NoteLayer';
import { PianoKeys } from './PianoKeys';
import { VelocityLane } from './VelocityLane';
import { Ruler, RULER_HEIGHT } from './Ruler';
import { PlayheadHandle, HANDLE_HEIGHT } from './PlayheadHandle';
import { ToolWheel } from './ToolWheel';
import { useProjectStore } from '../../store/projectStore';
import { useUiStore } from '../../store/uiStore';
import { usePreviewNote } from '../../hooks/usePreviewNote';
import { pixelToTick, yToPitch, snapTick, getSnapTicksFromDivision, getSmartSnapTicks, tickToPixel, tickToSeconds } from '../../utils/timing';
import { computeNullDurations, getEffectiveDuration } from '../../utils/noteDuration';
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
  const [cursor, setCursor] = useState<string>('default');
  const [selectBox, setSelectBox] = useState<SelectBox>(null);
  const [, setDrawingNoteId] = useState<string | null>(null);
  const [modifierKeys, setModifierKeys] = useState<{ shift: boolean; cmdCtrl: boolean }>({ shift: false, cmdCtrl: false });
  const [ghostNotes, setGhostNotes] = useState<{ pitch: number; startTick: number; duration: number | null; velocity: number }[]>([]);
  const [ghostCopyMode, setGhostCopyMode] = useState(false);
  const [dotPreview, setDotPreview] = useState<{ tick: number; pitch: number } | null>(null);
  const [toolWheel, setToolWheel] = useState<{ x: number; y: number } | null>(null);

  const project = useProjectStore((s) => s.project);
  const addNote = useProjectStore((s) => s.addNote);
  const drawEditNote = useProjectStore((s) => s.drawEditNote);
  const moveNotes = useProjectStore((s) => s.moveNotes);
  const resizeNotes = useProjectStore((s) => s.resizeNotes);
  const trimNoteStart = useProjectStore((s) => s.trimNoteStart);
  const deleteNotes = useProjectStore((s) => s.deleteNotes);
  const pasteNotes = useProjectStore((s) => s.pasteNotes);
  const confirmDuration = useProjectStore((s) => s.confirmDuration);
  const setNoteVelocity = useProjectStore((s) => s.setNoteVelocity);
  const beginDrag = useProjectStore((s) => s.beginDrag);
  const endDrag = useProjectStore((s) => s.endDrag);
  const { previewNote } = usePreviewNote();

  const {
    tool, viewport, selectedNoteIds, snapDivision,
    activeClipId, playheadTick, isPlaying,
    lastDrawnDuration, dotPresetDuration,
    setTool, setViewport, setSelectedNoteIds, clearSelection,
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
  // Dot/Pencil + Ctrl/Cmd → temporarily becomes Pointer
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
  // Ctrl/Cmd held in dot or pencil mode → temporarily act as pointer (select)
  // Mid-drag safety: drag handlers use dragState.type, not tool, so switching is harmless
  const effectiveTool = (() => {
    if ((tool === 'draw' || tool === 'flex') && modifierKeys.cmdCtrl) return 'select' as const;
    return tool;
  })();

  // Immediately update cursor when effectiveTool changes (e.g. pressing Ctrl)
  // without waiting for a mouse move event
  useEffect(() => {
    if (dragState.current.type !== 'none') return; // don't interfere mid-drag
    if (effectiveTool === 'draw') setCursor(PENCIL_CURSOR);
    else setCursor('default');
  }, [effectiveTool]);

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

  // drag type
  const dragState = useRef<{
    type: 'none' | 'draw-resize' | 'move' | 'resize' | 'trim-start' | 'select-box' | 'dot-place' | 'ext-click';
    startX: number;
    startY: number;
    noteId?: string;
    noteStartTick?: number;
    notePitch?: number;
    mouseTickOffset?: number;
    mousePitchOffset?: number;
    lastPitch?: number;
  }>({ type: 'none', startX: 0, startY: 0 });

  // Hit test for notes — triangle head is transparent, extension line zones take priority
  const hitTestNote = useCallback(
    (mx: number, my: number): { note: Note; zone: 'body' | 'resize' | 'trim-start' | 'ext-body' | 'ext-end' } | null => {
      const headH = pps;
      const headW = headH * Math.sqrt(3) / 2;

      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        const effDur = getEffectiveDuration(n, notes, ticksPerMeasure);
        const cx = (n.startTick - scrollX) * ppt;
        const cy = size.height - (n.pitch - scrollY + 0.5) * pps;
        const tailFullW = effDur * ppt;

        // Full clickable area = triangle head union extension line
        const noteRight = cx + Math.max(headW, tailFullW);
        const noteTop = cy - headH / 2;
        const noteBot = cy + headH / 2;
        if (mx < cx - 2 || mx > noteRight + 2 || my < noteTop - 2 || my > noteBot + 2) continue;

        // Triangle head zone
        if (mx <= cx + headW) {
          // Null-duration: head is move (change pitch + tick)
          // Confirmed: head is trim-start (change start position)
          return { note: n, zone: n.duration === null ? 'body' : 'trim-start' };
        }

        // Extension line zones (past the head)
        if (tailFullW > headW && mx <= cx + tailFullW) {
          if (n.duration === null) {
            if (mx >= cx + tailFullW - 6) return { note: n, zone: 'ext-end' };
            return { note: n, zone: 'ext-body' };
          } else {
            const handleW = Math.max(6, Math.min(12, tailFullW * 0.2));
            if (mx >= cx + tailFullW - handleW) return { note: n, zone: 'resize' };
            return { note: n, zone: 'body' };
          }
        }

        // Fallback (head only, no extension)
        return { note: n, zone: n.duration === null ? 'body' : 'trim-start' };
      }
      return null;
    },
    [notes, scrollX, scrollY, ppt, pps, size.height, ticksPerMeasure]
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

      // Right-click → open tool wheel
      if (e.button === 2) {
        e.preventDefault();
        setToolWheel({ x: e.clientX, y: e.clientY });
        return;
      }

      if (!activeClipId) return;
      // Clear preview ghost immediately on mousedown
      setDotPreview(null);
      const rect = e.currentTarget.getBoundingClientRect();
      canvasRect.current = rect;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const tick = pixelToTick(mx, ppt, scrollX);
      const pitch = yToPitch(my, pps, scrollY, size.height);

      // Register global mouseup so drag always ends, even if mouse leaves canvas
      const globalMouseUp = (ev: MouseEvent) => {
        document.removeEventListener('mouseup', globalMouseUp);
        const ds = dragState.current;
        if (ds.type === 'select-box' && canvasRect.current) {
          const umx = ev.clientX - canvasRect.current.left;
          const umy = ev.clientY - canvasRect.current.top;
          const x1 = Math.min(ds.startX, umx);
          const x2 = Math.max(ds.startX, umx);
          const y1 = Math.min(ds.startY, umy);
          const y2 = Math.max(ds.startY, umy);
          const { viewport, selectedNoteIds: selIds } = useUiStore.getState();
          const currentClips = useProjectStore.getState().project.tracks.flatMap((t) => t.clips);
          const tsMeasure = useProjectStore.getState().project.ticksPerBeat * tsNum * (4 / tsDen);
          const boxSelected = new Set<string>();
          for (const clip of currentClips) {
            for (const n of clip.notes) {
              const effDur = getEffectiveDuration(n, clip.notes, tsMeasure);
              const nx = (n.startTick - viewport.scrollX) * viewport.pixelsPerTick;
              const nw = effDur * viewport.pixelsPerTick;
              const ny = size.height - (n.pitch - viewport.scrollY + 0.5) * viewport.pixelsPerSemitone;
              const hH = viewport.pixelsPerSemitone * 0.5; // half head height
              // Check if triangle head or extension line overlaps with select box
              if (nx + nw >= x1 && nx <= x2 && ny + hH >= y1 && ny - hH <= y2) {
                boxSelected.add(n.id);
              }
            }
          }
          const selected = ev.shiftKey
            ? new Set([...selIds, ...boxSelected])
            : boxSelected;
          setSelectedNoteIds(selected);
        }
        // Alt+drag copy
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
          if (drawnNote && drawnNote.duration !== null && drawnNote.duration > 0) {
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

      if (effectiveTool === 'flex') {
        // Dot tool: click to place note with null duration (or preset duration)
        const hit = hitTestNote(mx, my);
        if (hit && hit.zone === 'body') {
          // Click note body/head → select and prepare to move
          beginDrag();
          if (!selectedNoteIds.has(hit.note.id)) {
            setSelectedNoteIds(e.shiftKey ? new Set([...selectedNoteIds, hit.note.id]) : new Set([hit.note.id]));
          }
          const effDur = getEffectiveDuration(hit.note, notes, ticksPerMeasure);
          previewNote(hit.note.pitch, tickToSeconds(effDur, bpm, project.ticksPerBeat), hit.note.velocity);
          const mouseTick = pixelToTick(mx, ppt, scrollX);
          const mousePitch = yToPitch(my, pps, scrollY, size.height);
          dragState.current = {
            type: 'move', startX: mx, startY: my, noteId: hit.note.id,
            noteStartTick: hit.note.startTick, notePitch: hit.note.pitch,
            mouseTickOffset: mouseTick - hit.note.startTick,
            mousePitchOffset: mousePitch - hit.note.pitch,
            lastPitch: hit.note.pitch,
          };
        } else if (hit && (hit.zone === 'ext-end' || hit.zone === 'resize')) {
          // Drag extension line end / resize handle → resize
          beginDrag();
          dragState.current = { type: 'resize', startX: mx, startY: my, noteId: hit.note.id, noteStartTick: hit.note.startTick };
        } else if (hit && hit.zone === 'trim-start') {
          // Trim start handle
          beginDrag();
          dragState.current = { type: 'trim-start', startX: mx, startY: my, noteId: hit.note.id, noteStartTick: hit.note.startTick };
        } else {
          // Click empty space → place new note
          beginDrag();
          const snappedTick = snapTick(tick, snapTicks, ticksPerMeasure);
          const clampedPitch = Math.min(127, Math.max(0, Math.round(pitch)));
          const newNoteId = addNote(activeClipId, {
            pitch: clampedPitch,
            startTick: Math.max(0, snappedTick),
            duration: dotPresetDuration, // null or preset
            velocity: 80,
            channel: 0,
            pitchBend: [],
          });
          previewNote(clampedPitch, 0.3, 80);
          clearSelection();
          dragState.current = {
            type: 'dot-place', startX: mx, startY: my,
            noteId: newNoteId,
            noteStartTick: Math.max(0, snappedTick),
            notePitch: clampedPitch,
            lastPitch: clampedPitch,
          };
        }
      } else if (effectiveTool === 'draw') {
        const hit = hitTestNote(mx, my);
        if (hit) {
          beginDrag();
          if (hit.zone === 'resize' || hit.zone === 'ext-end') {
            dragState.current = { type: 'resize', startX: mx, startY: my, noteId: hit.note.id, noteStartTick: hit.note.startTick };
          } else if (hit.zone === 'trim-start') {
            dragState.current = { type: 'trim-start', startX: mx, startY: my, noteId: hit.note.id, noteStartTick: hit.note.startTick };
          } else {
            if (!selectedNoteIds.has(hit.note.id)) {
              setSelectedNoteIds(e.shiftKey ? new Set([...selectedNoteIds, hit.note.id]) : new Set([hit.note.id]));
            }
            const effDur = getEffectiveDuration(hit.note, notes, ticksPerMeasure);
            previewNote(hit.note.pitch, tickToSeconds(effDur, bpm, project.ticksPerBeat), hit.note.velocity);
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
          // Create note with explicit duration (pencil tool)
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
          if (hit.zone === 'resize' || hit.zone === 'ext-end') {
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

            const effDur = getEffectiveDuration(hit.note, notes, ticksPerMeasure);
            previewNote(hit.note.pitch, tickToSeconds(effDur, bpm, project.ticksPerBeat), hit.note.velocity);
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

            // Ghost notes at original positions during move drag
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
      }
    },
    [effectiveTool, activeClipId, ppt, pps, scrollX, scrollY, size.height, snapTicks, notes, selectedNoteIds, hitTestNote, addNote, drawEditNote, beginDrag, clearSelection, deleteNotes, setSelectedNoteIds, previewNote, confirmDuration, dotPresetDuration, ticksPerMeasure]
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
        // In flex tool, null-duration ext-body is "transparent" — no hover, show preview through it
        const isTransparentHit = effectiveTool === 'flex' && hit && hit.zone === 'ext-body' && hit.note.duration === null;
        const effectiveHit = isTransparentHit ? null : hit;
        useUiStore.getState().setHoveredNoteId(effectiveHit?.note.id ?? null);
        if (effectiveHit?.zone === 'resize' || effectiveHit?.zone === 'ext-end') {
          setCursor('ew-resize');
        } else if (effectiveHit?.zone === 'trim-start') {
          setCursor('ew-resize');
        } else if (effectiveHit?.zone === 'ext-body') {
          setCursor('pointer');
        } else if (effectiveHit) {
          setCursor('grab');
        } else if (effectiveTool === 'draw') {
          setCursor(PENCIL_CURSOR);
        } else {
          setCursor('default');
        }

        // Flex preview: show when hovering empty space or transparent null-duration body
        if (effectiveTool === 'flex' && !effectiveHit) {
          const rawTick = pixelToTick(mx, ppt, scrollX);
          const rawPitch = yToPitch(my, pps, scrollY, size.height);
          const snappedTick = snapTick(rawTick, snapTicks, ticksPerMeasure);
          const clampedPitch = Math.min(127, Math.max(0, Math.round(rawPitch)));
          setDotPreview({ tick: Math.max(0, snappedTick), pitch: clampedPitch });
        } else {
          setDotPreview(null);
        }
        return;
      }

      if (ds.type === 'select-box') {
        setSelectBox({ x1: ds.startX, y1: ds.startY, x2: mx, y2: my });
        return;
      }

      if (!activeClipId) return;

      // Dot-place: slide to adjust pitch/tick while mouse held
      if (ds.type === 'dot-place' && ds.noteId) {
        const rawPitch = yToPitch(my, pps, scrollY, size.height);
        const newPitch = Math.min(127, Math.max(0, Math.round(rawPitch)));
        const rawTick = pixelToTick(mx, ppt, scrollX);
        const newTick = Math.max(0, snapTick(rawTick, snapTicks, ticksPerMeasure));
        const note = notes.find((n) => n.id === ds.noteId);
        if (note && (newPitch !== note.pitch || newTick !== note.startTick)) {
          moveNotes(activeClipId, [ds.noteId], newTick - note.startTick, newPitch - note.pitch);
          if (newPitch !== ds.lastPitch) {
            previewNote(newPitch, 0.3, note.velocity);
            ds.lastPitch = newPitch;
          }
        }
        return;
      }

      if (ds.type === 'draw-resize' && ds.noteId && ds.noteStartTick !== undefined) {
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
        setGhostCopyMode(e.altKey);
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
            if (deltaPitch !== 0) {
              const newPitch = note.pitch + deltaPitch;
              if (newPitch !== ds.lastPitch) {
                const effDur = getEffectiveDuration(note, notes, ticksPerMeasure);
                previewNote(newPitch, tickToSeconds(effDur, bpm, project.ticksPerBeat), note.velocity);
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
          const currentDur = note.duration ?? getEffectiveDuration(note, notes, ticksPerMeasure);
          const delta = newDuration - currentDur;
          if (delta !== 0) {
            const idsToResize = selectedNoteIds.has(ds.noteId) ? Array.from(selectedNoteIds) : [ds.noteId];
            // For null-duration notes, first confirm, then resize
            if (note.duration === null) {
              confirmDuration(activeClipId, idsToResize);
            }
            resizeNotes(activeClipId, idsToResize, delta);
          }
        }
      } else if (ds.type === 'trim-start' && ds.noteId && ds.noteStartTick !== undefined) {
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
    [activeClipId, ppt, pps, scrollX, scrollY, size.height, snapTicks, selectedNoteIds, notes, drawEditNote, moveNotes, resizeNotes, trimNoteStart, hitTestNote, effectiveTool, previewNote, confirmDuration, ticksPerMeasure]
  );

  const handleMouseLeave = useCallback(() => {
    setCursor(effectiveTool === 'draw' ? PENCIL_CURSOR : 'default');
    useUiStore.getState().setHoveredNoteId(null);
    setDotPreview(null);
  }, [effectiveTool]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
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

  // Touch: GarageBand-style
  const TOUCH_PAD = 12;
  const TOUCH_DEADZONE = 10;

  const touchState = useRef<{
    phase: 'pending' | 'active';
    startX: number;
    startY: number;
    hit: { note: Note; zone: 'body' | 'resize' | 'trim-start' | 'ext-body' | 'ext-end' } | null;
    mode: 'scroll' | 'move' | 'resize' | 'trim-start' | 'ext-body';
    noteId?: string;
    noteStartTick?: number;
    mouseTickOffset?: number;
    mousePitchOffset?: number;
  } | null>(null);

  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;

    const touchHitTest = (mx: number, my: number, canvasH: number, vp: { scrollX: number; scrollY: number; pixelsPerTick: number; pixelsPerSemitone: number }, clipNotes: Note[]): { note: Note; zone: 'body' | 'resize' | 'trim-start' | 'ext-body' | 'ext-end' } | null => {
      const dotR = vp.pixelsPerSemitone * 0.4;
      for (let i = clipNotes.length - 1; i >= 0; i--) {
        const n = clipNotes[i];
        const cx = (n.startTick - vp.scrollX) * vp.pixelsPerTick;
        const cy = canvasH - (n.pitch - vp.scrollY + 0.5) * vp.pixelsPerSemitone;
        // Check dot circle
        const dist = Math.hypot(mx - cx, my - cy);
        if (dist <= dotR + TOUCH_PAD) return { note: n, zone: 'body' };
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

      touchState.current = {
        phase: 'pending',
        startX: touch.clientX, startY: touch.clientY,
        hit,
        mode: hit ? (hit.zone === 'body' ? 'move' : hit.zone === 'ext-end' ? 'resize' : hit.zone) : 'scroll',
      };
    };

    const activateDrag = (ts: NonNullable<typeof touchState.current>) => {
      ts.phase = 'active';
      if (ts.hit) {
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
      const tsState = touchState.current;

      if (tsState.phase === 'pending') {
        const dist = Math.hypot(touch.clientX - tsState.startX, touch.clientY - tsState.startY);
        if (dist < TOUCH_DEADZONE) return;
        activateDrag(tsState);
      }

      const rect = el.getBoundingClientRect();
      const mx = touch.clientX - rect.left;
      const my = touch.clientY - rect.top;
      const vp = useUiStore.getState().viewport;

      if (tsState.mode === 'scroll') {
        const dx = touch.clientX - tsState.startX;
        const dy = touch.clientY - tsState.startY;
        tsState.startX = touch.clientX;
        tsState.startY = touch.clientY;
        useUiStore.getState().setViewport({
          scrollX: Math.max(0, vp.scrollX - dx / vp.pixelsPerTick),
          scrollY: Math.max(0, Math.min(115, vp.scrollY + dy / vp.pixelsPerSemitone)),
        });
        return;
      }

      const clipId = useUiStore.getState().activeClipId;
      const store = useProjectStore.getState();
      const clip = clipId ? store.project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId) : null;
      if (!clip || !clipId || !tsState.noteId) return;
      const selIds = useUiStore.getState().selectedNoteIds;
      const ids = selIds.has(tsState.noteId) ? Array.from(selIds) : [tsState.noteId];
      const proj = useProjectStore.getState().project;
      const tsig = proj.timeSignatureChanges[0] ?? { numerator: 4, denominator: 4 };
      const tpm = proj.ticksPerBeat * (tsig.numerator ?? 4) * (4 / (tsig.denominator ?? 4));
      const sn = useUiStore.getState().snapDivision === 'smart'
        ? getSmartSnapTicks(vp.pixelsPerTick, proj.ticksPerBeat, tsig.numerator ?? 4, tsig.denominator ?? 4)
        : getSnapTicksFromDivision(useUiStore.getState().snapDivision as number, proj.ticksPerBeat, tsig.numerator ?? 4, tsig.denominator ?? 4);

      if (tsState.mode === 'move' && tsState.noteStartTick !== undefined && tsState.mouseTickOffset !== undefined && tsState.mousePitchOffset !== undefined) {
        const curTick = pixelToTick(mx, vp.pixelsPerTick, vp.scrollX);
        const curPitch = yToPitch(my, vp.pixelsPerSemitone, vp.scrollY, sizeRef.current.height);
        const targetTick = Math.max(0, snapTick(curTick - tsState.mouseTickOffset, sn, tpm));
        const targetPitch = Math.round(curPitch - tsState.mousePitchOffset);
        const note = clip.notes.find((n) => n.id === tsState.noteId);
        if (note) {
          const dt = targetTick - note.startTick;
          const dp = Math.min(127, Math.max(0, targetPitch)) - note.pitch;
          if (dt !== 0 || dp !== 0) store.moveNotes(clipId, ids, dt, dp);
        }
      } else if (tsState.mode === 'resize' && tsState.noteStartTick !== undefined) {
        const curTick = pixelToTick(mx, vp.pixelsPerTick, vp.scrollX);
        const newDur = Math.max(sn, Math.round((curTick - tsState.noteStartTick) / sn) * sn);
        const note = clip.notes.find((n) => n.id === tsState.noteId);
        if (note) {
          const currentDur = note.duration ?? sn;
          const delta = newDur - currentDur;
          if (delta !== 0) store.resizeNotes(clipId, ids, delta);
        }
      } else if (tsState.mode === 'trim-start') {
        const curTick = pixelToTick(mx, vp.pixelsPerTick, vp.scrollX);
        const newStart = snapTick(curTick, sn, tpm);
        const note = clip.notes.find((n) => n.id === tsState.noteId);
        if (note) {
          const delta = newStart - note.startTick;
          if (delta !== 0) store.trimNoteStart(clipId, ids, delta);
        }
      }
    };

    const onTouchEnd = () => {
      const tsState = touchState.current;
      if (tsState) {
        if (tsState.phase === 'pending' && tsState.hit) {
          useUiStore.getState().setSelectedNoteIds(new Set([tsState.hit.note.id]));
        } else if (tsState.phase === 'pending' && !tsState.hit) {
          useUiStore.getState().clearSelection();
        } else if (tsState.phase === 'active' && tsState.mode !== 'scroll') {
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

  // Compute null durations for rendering extension lines
  const nullDurations = React.useMemo(
    () => computeNullDurations(notes, ticksPerMeasure),
    [notes, ticksPerMeasure]
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

      {/* Chord Track row */}
      <div style={{ display: 'flex' }}>
        <div style={{ width: PIANO_KEY_WIDTH, flexShrink: 0, backgroundColor: '#1e1e1e', borderRight: '2px solid #555' }} />
        <div style={{ flex: 1, height: pps, backgroundColor: '#1e1e22' }} />
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
            nullDurations={nullDurations}
            selectedNoteIds={selectedNoteIds}
            ghostNotes={ghostNotes}
            ghostCopyMode={ghostCopyMode}
            dotPreview={dotPreview}
            cursor={cursor}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onContextMenu={handleContextMenu}
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

      {/* Playhead handle strip */}
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

      {/* Tool wheel (right-click radial menu) */}
      {toolWheel && (
        <ToolWheel
          x={toolWheel.x}
          y={toolWheel.y}
          currentTool={tool}
          onSelect={(t) => setTool(t)}
          onClose={() => setToolWheel(null)}
        />
      )}
    </div>
  );
};
