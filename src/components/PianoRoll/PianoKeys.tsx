import React, { useRef, useCallback, useEffect, useState } from 'react';
import { pitchToNoteName, pitchClass } from '../../utils/music';
import { useUiStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { getPianoSampler } from '../../audio/pianoSampler';
import * as Tone from 'tone';

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const PIANO_KEY_WIDTH = 56;



interface PianoKeysProps {
  scrollY: number;
  pixelsPerSemitone: number;
  canvasHeight: number;
}

export const PianoKeys: React.FC<PianoKeysProps> = ({
  scrollY,
  pixelsPerSemitone,
  canvasHeight,
}) => {
  const selectedNoteIds = useUiStore((s) => s.selectedNoteIds);
  const activeClipId = useUiStore((s) => s.activeClipId);
  const scaleRoot = useUiStore((s) => s.scaleRoot);
  const [hoveredPitch, setHoveredPitch] = useState<number | null>(null);
  const [pressedPitch, setPressedPitch] = useState<number | null>(null);
  const activeNoteRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeClip = useProjectStore((s) =>
    s.project.tracks.flatMap((t) => t.clips).find((c) => c.id === activeClipId)
  );
  const notes = activeClip?.notes ?? [];

  const selectedPitches = new Set<number>();
  for (const note of notes) {
    if (selectedNoteIds.has(note.id)) selectedPitches.add(note.pitch);
  }

  // Attack a pitch — start sustaining
  const attackPitch = useCallback(async (pitch: number) => {
    await Tone.start();
    const sampler = await getPianoSampler();
    const noteName = Tone.Frequency(pitch, 'midi').toNote();
    // Release previous if glissando
    if (activeNoteRef.current && activeNoteRef.current !== noteName) {
      sampler.triggerRelease(activeNoteRef.current, Tone.now());
    }
    if (activeNoteRef.current !== noteName) {
      sampler.triggerAttack(noteName, Tone.now(), 0.6);
      activeNoteRef.current = noteName;
    }
  }, []);

  // Release current pitch
  const releasePitch = useCallback(async () => {
    if (!activeNoteRef.current) return;
    const sampler = await getPianoSampler();
    sampler.triggerRelease(activeNoteRef.current, Tone.now());
    activeNoteRef.current = null;
  }, []);

  // Select notes at pitch
  const selectAtPitch = useCallback((pitch: number, shiftKey: boolean) => {
    const notesAtPitch = notes.filter((n) => n.pitch === pitch);
    if (notesAtPitch.length === 0) {
      if (!shiftKey) useUiStore.getState().clearSelection();
      return;
    }
    const ids = notesAtPitch.map((n) => n.id);
    const { selectedNoteIds: sel, setSelectedNoteIds: setSel } = useUiStore.getState();
    if (shiftKey) {
      const allSelected = ids.every((id) => sel.has(id));
      const next = new Set(sel);
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      setSel(next);
    } else {
      setSel(new Set(ids));
    }
  }, [notes]);

  // Convert clientY to pitch
  const yToPitchLocal = useCallback((clientY: number): number | null => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const my = clientY - rect.top;
    const pitch = Math.floor(scrollY) + Math.floor((canvasHeight - my) / pixelsPerSemitone);
    if (pitch < 0 || pitch > 127) return null;
    return pitch;
  }, [scrollY, canvasHeight, pixelsPerSemitone]);

  // Mouse down: start note, select, register global listeners for glissando
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const pitch = yToPitchLocal(e.clientY);
    if (pitch === null) return;

    setPressedPitch(pitch);
    attackPitch(pitch);
    selectAtPitch(pitch, e.shiftKey);

    const shiftHeld = e.shiftKey;

    const onMove = (ev: MouseEvent) => {
      const p = yToPitchLocal(ev.clientY);
      if (p === null) return;
      setPressedPitch(p);
      setHoveredPitch(p);
      attackPitch(p); // glissando: triggers new note, releases previous
      selectAtPitch(p, shiftHeld);
    };

    const onUp = () => {
      setPressedPitch(null);
      releasePitch();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [yToPitchLocal, attackPitch, releasePitch, selectAtPitch]);

  // Hover
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const p = yToPitchLocal(e.clientY);
    setHoveredPitch(p);
  }, [yToPitchLocal]);

  const handleMouseLeave = useCallback(() => {
    setHoveredPitch(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { releasePitch(); };
  }, [releasePitch]);

  const keys: React.ReactNode[] = [];
  const visiblePitches = Math.ceil(canvasHeight / pixelsPerSemitone) + 2;

  for (let i = -1; i <= visiblePitches; i++) {
    const pitch = Math.floor(scrollY) + i;
    if (pitch < 0 || pitch > 127) continue;

    const yOffset = scrollY - Math.floor(scrollY);
    const y = canvasHeight - (pitch - Math.floor(scrollY) + 1) * pixelsPerSemitone + yOffset * pixelsPerSemitone;
    const pc = pitchClass(pitch);
    const isBlack = BLACK_KEYS.has(pc);
    const isRoot = pc === scaleRoot;
    const isActive = selectedPitches.has(pitch);
    const isHovered = hoveredPitch === pitch;
    const isPressed = pressedPitch === pitch;

    // Colors — Logic Pro style
    let bg: string;
    if (isBlack) {
      if (isPressed) bg = '#5a5a5a';
      else if (isActive) bg = '#3a3a3a';
      else if (isHovered) bg = '#2e2e2e';
      else bg = '#1a1a1a';
    } else {
      if (isPressed) bg = '#a8a8a8';
      else if (isActive) bg = '#b0b0b0';
      else if (isHovered) bg = '#d2d2d2';
      else bg = '#c8c8c8';
    }

    // All keys same width for consistent click area
    keys.push(
      <div
        key={pitch}
        data-pitch={pitch}
        style={{
          position: 'absolute',
          top: y,
          left: 0,
          width: PIANO_KEY_WIDTH,
          height: pixelsPerSemitone,
          backgroundColor: bg,
          borderBottom: '1px solid #aaa',
          borderRight: '1px solid #888',
          zIndex: isBlack ? 2 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: isBlack ? 4 : 6,
          boxSizing: 'border-box',
          userSelect: 'none',
          cursor: 'default',
          // Black key visual: clip the right portion to look shorter visually
          ...(isBlack ? {
            background: `linear-gradient(to right, ${bg} 0%, ${bg} 60%, transparent 60%)`,
            backgroundColor: 'transparent',
          } : {}),
        }}
      >
        {isRoot && (
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            color: '#555',
            fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif',
            letterSpacing: -0.3,
          }}>
            {pitchToNoteName(pitch)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: PIANO_KEY_WIDTH,
        height: canvasHeight,
        overflow: 'hidden',
        flexShrink: 0,
        backgroundColor: '#b0b0b0',
        borderRight: '2px solid #555',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {keys}
    </div>
  );
};
