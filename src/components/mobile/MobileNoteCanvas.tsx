import React, { useRef, useEffect } from 'react';
import type { Note } from '../../types/model';
import { isInScale, pitchClass } from '../../utils/music';

/**
 * Combined canvas for mobile: renders grid + notes in one layer.
 * No mouse events — touch handled by parent.
 */

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

interface MobileNoteCanvasProps {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  pixelsPerTick: number;
  pixelsPerSemitone: number;
  ticksPerBeat: number;
  numerator: number;
  notes: Note[];
  selectedNoteIds: Set<string>;
  scaleRoot: number;
  scaleMode: string;
}

function velocityToColor(velocity: number, selected: boolean, inScale: boolean): string {
  const v = velocity / 127;
  if (selected) return `hsl(42, 85%, ${50 + v * 15}%)`;
  if (!inScale) return `hsla(350, 50%, ${35 + v * 15}%, 0.85)`;
  return `hsl(${210 + v * 10}, ${55 + v * 15}%, ${40 + v * 20}%)`;
}

export const MobileNoteCanvas: React.FC<MobileNoteCanvasProps> = ({
  width, height, scrollX, scrollY, pixelsPerTick, pixelsPerSemitone,
  ticksPerBeat, numerator, notes, selectedNoteIds, scaleRoot, scaleMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#1a1a1c';
    ctx.fillRect(0, 0, width, height);

    const ppt = pixelsPerTick;
    const pps = pixelsPerSemitone;
    const visiblePitches = Math.ceil(height / pps) + 2;

    // ─── Grid: pitch rows ─────────────────────────────────
    for (let i = -1; i <= visiblePitches; i++) {
      const pitch = scrollY + i;
      if (pitch < 0 || pitch > 127) continue;
      const y = height - (pitch - scrollY + 1) * pps;
      const isBlack = BLACK_KEYS.has(pitchClass(pitch));
      const inScale = isInScale(pitch, scaleRoot, scaleMode);
      const isRoot = pitchClass(pitch) === pitchClass(scaleRoot);

      if (isRoot) ctx.fillStyle = 'rgba(255, 190, 60, 0.05)';
      else if (inScale) ctx.fillStyle = isBlack ? 'rgba(120, 200, 140, 0.015)' : 'rgba(120, 200, 140, 0.035)';
      else ctx.fillStyle = isBlack ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.01)';
      ctx.fillRect(0, y, width, pps);

      // Horizontal line
      const isOctave = pitchClass(pitch) === 0;
      ctx.strokeStyle = isOctave ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.025)';
      ctx.lineWidth = isOctave ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + pps);
      ctx.lineTo(width, y + pps);
      ctx.stroke();
    }

    // ─── Grid: beat/bar lines ─────────────────────────────
    const ticksPerBar = ticksPerBeat * numerator;
    const startTick = Math.floor(scrollX / ticksPerBeat) * ticksPerBeat;
    const endTick = scrollX + width / ppt;

    for (let tick = startTick; tick <= endTick; tick += ticksPerBeat) {
      const x = (tick - scrollX) * ppt;
      const isBar = tick % ticksPerBar === 0;
      ctx.strokeStyle = isBar ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)';
      ctx.lineWidth = isBar ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      if (isBar) {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '500 10px Inter, -apple-system, sans-serif';
        ctx.fillText(String(Math.floor(tick / ticksPerBar) + 1), x + 3, 13);
      }
    }

    // ─── Notes ────────────────────────────────────────────
    const minTick = scrollX;
    const maxTick = scrollX + width / ppt;
    const minPitch = scrollY - 1;
    const maxPitch = scrollY + visiblePitches + 1;

    for (const note of notes) {
      if (note.startTick + note.duration < minTick || note.startTick > maxTick) continue;
      if (note.pitch < minPitch || note.pitch > maxPitch) continue;

      const x = (note.startTick - scrollX) * ppt;
      const w = note.duration * ppt;
      const y = height - (note.pitch - scrollY + 1) * pps;
      const selected = selectedNoteIds.has(note.id);
      const inScale = isInScale(note.pitch, scaleRoot, scaleMode);

      const noteX = x + 0.5;
      const noteY = y + 1;
      const noteW = Math.max(w - 1, 3);
      const noteH = pps - 2;
      const radius = Math.min(4, noteH / 3, noteW / 3);

      ctx.beginPath();
      ctx.roundRect(noteX, noteY, noteW, noteH, radius);
      ctx.fillStyle = velocityToColor(note.velocity, selected, inScale);
      ctx.fill();

      // Top highlight
      const grad = ctx.createLinearGradient(noteX, noteY, noteX, noteY + noteH);
      grad.addColorStop(0, 'rgba(255,255,255,0.12)');
      grad.addColorStop(0.3, 'rgba(255,255,255,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.1)');
      ctx.fillStyle = grad;
      ctx.fill();

      if (selected) {
        ctx.strokeStyle = 'rgba(255, 215, 100, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      if (noteW > 28 && noteH >= 12) {
        ctx.fillStyle = selected ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)';
        ctx.font = `500 ${Math.min(10, noteH - 4)}px Inter, -apple-system, sans-serif`;
        const name = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][pitchClass(note.pitch)];
        ctx.fillText(name, noteX + 4, noteY + noteH - 3);
      }
    }

    // ─── Piano key labels on left edge ────────────────────
    for (let i = -1; i <= visiblePitches; i++) {
      const pitch = scrollY + i;
      if (pitch < 0 || pitch > 127) continue;
      const y = height - (pitch - scrollY + 1) * pps;
      const isRoot = pitchClass(pitch) === pitchClass(scaleRoot);
      const isC = pitchClass(pitch) === 0;

      if (isC || isRoot) {
        const octave = Math.floor(pitch / 12) - 1;
        const noteName = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][pitchClass(pitch)];
        ctx.fillStyle = isRoot ? 'rgba(255,200,80,0.7)' : 'rgba(255,255,255,0.35)';
        ctx.font = `${isRoot ? 600 : 400} 9px Inter, -apple-system, sans-serif`;
        ctx.fillText(`${noteName}${octave}`, 3, y + pps - 3);
      }
    }
  }, [width, height, scrollX, scrollY, pixelsPerTick, pixelsPerSemitone, ticksPerBeat, numerator, notes, selectedNoteIds, scaleRoot, scaleMode]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', top: 0, left: 0, width, height, touchAction: 'none' }}
    />
  );
};
