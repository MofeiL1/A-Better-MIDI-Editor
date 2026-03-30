import React, { useRef, useEffect } from 'react';
import { pitchToNoteName, isInScale, isRoot, pitchClass } from '../../utils/music';

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const KEY_WIDTH = 34;

interface MobilePianoKeysProps {
  scrollY: number;
  pixelsPerSemitone: number;
  canvasHeight: number;
  scaleRoot: number;
  scaleMode: string;
}

/**
 * Fixed left-side piano key strip for mobile.
 * Uses canvas for flicker-free rendering synced to the grid.
 */
export const MobilePianoKeys: React.FC<MobilePianoKeysProps> = ({
  scrollY,
  pixelsPerSemitone,
  canvasHeight,
  scaleRoot,
  scaleMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasHeight <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = KEY_WIDTH * dpr;
    canvas.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, KEY_WIDTH, canvasHeight);

    const pps = pixelsPerSemitone;
    const visiblePitches = Math.ceil(canvasHeight / pps) + 2;

    for (let i = -1; i <= visiblePitches; i++) {
      const pitch = scrollY + i;
      if (pitch < 0 || pitch > 127) continue;

      const y = canvasHeight - (pitch - scrollY + 1) * pps;
      const isBlack = BLACK_KEYS.has(pitchClass(pitch));
      const inScale = isInScale(pitch, scaleRoot, scaleMode);
      const rootNote = isRoot(pitch, scaleRoot);
      const isC = pitchClass(pitch) === 0;

      // Background
      if (rootNote) ctx.fillStyle = '#332d1e';
      else if (inScale) ctx.fillStyle = isBlack ? '#1e2220' : '#262e28';
      else ctx.fillStyle = isBlack ? '#161618' : '#222224';
      ctx.fillRect(0, y, KEY_WIDTH, pps);

      // Border
      ctx.strokeStyle = isC ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)';
      ctx.lineWidth = isC ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + pps);
      ctx.lineTo(KEY_WIDTH, y + pps);
      ctx.stroke();

      // Label
      const showLabel = isC || rootNote;
      if (showLabel && pps >= 8) {
        const name = pitchToNoteName(pitch);
        ctx.fillStyle = rootNote ? 'rgba(255, 200, 80, 0.9)' : 'rgba(255, 255, 255, 0.5)';
        ctx.font = `${rootNote ? '600' : '400'} ${Math.min(11, pps - 2)}px Inter, -apple-system, sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(name, KEY_WIDTH - 4, y + pps / 2 + 4);
        ctx.textAlign = 'left';
      }

      // In-scale dot for non-labeled keys
      if (!showLabel && inScale && pps >= 6) {
        ctx.fillStyle = rootNote ? 'rgba(255,200,80,0.4)' : 'rgba(120,200,140,0.3)';
        ctx.beginPath();
        ctx.arc(KEY_WIDTH - 6, y + pps / 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [scrollY, pixelsPerSemitone, canvasHeight, scaleRoot, scaleMode]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: KEY_WIDTH,
        height: canvasHeight,
        flexShrink: 0,
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    />
  );
};

export { KEY_WIDTH };
