import React, { useRef, useEffect, useState } from 'react';
import type { TonalRegion } from '../../utils/tonalSegmentation';
import { keyName } from '../../utils/tonalSegmentation';

interface KeyStripProps {
  width: number;
  height: number;
  scrollX: number;
  pixelsPerTick: number;
  regions: TonalRegion[];
  isAtonal: boolean;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Color palette for keys, assigned by root pitch class around the circle of fifths.
 * Adjacent keys on the circle get similar hues for visual continuity.
 */
const KEY_COLORS: Record<number, { h: number; s: number; l: number }> = {
  0:  { h: 210, s: 70, l: 60 },  // C  - blue
  7:  { h: 190, s: 65, l: 55 },  // G  - cyan-blue
  2:  { h: 170, s: 60, l: 55 },  // D  - teal
  9:  { h: 280, s: 55, l: 60 },  // A  - purple
  4:  { h: 300, s: 50, l: 55 },  // E  - magenta
  11: { h: 320, s: 50, l: 55 },  // B  - pink
  6:  { h: 340, s: 50, l: 55 },  // F# - rose
  1:  { h: 0,   s: 55, l: 55 },  // C# - red
  8:  { h: 20,  s: 60, l: 55 },  // G# - orange-red
  3:  { h: 40,  s: 65, l: 55 },  // D# - orange
  10: { h: 60,  s: 60, l: 50 },  // A# - yellow
  5:  { h: 130, s: 55, l: 50 },  // F  - green
};

function keyColor(root: number, probability: number): string {
  const c = KEY_COLORS[root] ?? { h: 210, s: 50, l: 50 };
  // Probability affects opacity: high confidence = more vivid
  const alpha = 0.15 + probability * 0.55; // range: 0.15 - 0.70
  return `hsla(${c.h}, ${c.s}%, ${c.l}%, ${alpha})`;
}

function keyBorderColor(root: number, probability: number): string {
  const c = KEY_COLORS[root] ?? { h: 210, s: 50, l: 50 };
  const alpha = 0.3 + probability * 0.5;
  return `hsla(${c.h}, ${c.s}%, ${c.l + 15}%, ${alpha})`;
}

function keyTextColor(root: number, probability: number): string {
  const c = KEY_COLORS[root] ?? { h: 210, s: 50, l: 50 };
  const alpha = 0.4 + probability * 0.5;
  return `hsla(${c.h}, ${c.s - 10}%, ${c.l + 30}%, ${alpha})`;
}

/** Short mode abbreviation for display. */
function modeShort(mode: string): string {
  switch (mode) {
    case 'major': return '';
    case 'natural minor': return 'm';
    case 'dorian': return 'dor';
    case 'mixolydian': return 'mix';
    case 'harmonic minor': return 'hm';
    case 'melodic minor': return 'mm';
    default: return mode.slice(0, 3);
  }
}

export const KeyStrip: React.FC<KeyStripProps> = ({
  width,
  height,
  scrollX,
  pixelsPerTick,
  regions,
  isAtonal,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverRegionIdx, setHoverRegionIdx] = useState<number | null>(null);

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

    // Background
    ctx.fillStyle = '#1a1a1e';
    ctx.fillRect(0, 0, width, height);

    // Bottom border
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(width, height - 0.5);
    ctx.stroke();

    if (isAtonal || regions.length === 0) {
      // Show "atonal" or "no data" message
      ctx.font = `500 9px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;
      ctx.fillStyle = 'rgba(120, 120, 130, 0.6)';
      ctx.textBaseline = 'middle';
      ctx.fillText(isAtonal ? 'atonal' : '', 6, height / 2);
      return;
    }

    for (let ri = 0; ri < regions.length; ri++) {
      const region = regions[ri];
      const x = (region.startTick - scrollX) * pixelsPerTick;
      const w = (region.endTick - region.startTick) * pixelsPerTick;

      if (x + w < 0 || x > width) continue;
      if (w < 2) continue;

      const prob = region.bestKeyProbability;
      const root = region.bestKey.root;
      const isHovered = hoverRegionIdx === ri;

      // Region fill
      const fillColor = keyColor(root, isHovered ? Math.min(1, prob + 0.15) : prob);
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.roundRect(x, 1, w, height - 2, 3);
      ctx.fill();

      // Border for stable regions
      if (region.type === 'stable') {
        ctx.strokeStyle = keyBorderColor(root, prob);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, 1, w, height - 2, 3);
        ctx.stroke();
      } else {
        // Transition: dashed border
        ctx.strokeStyle = keyBorderColor(root, prob * 0.6);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.roundRect(x, 1, w, height - 2, 3);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Key name label
      if (w > 25) {
        const fontSize = Math.min(10, height - 4);
        ctx.font = `600 ${fontSize}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;

        const rootName = NOTE_NAMES[root];
        const mode = modeShort(region.bestKey.mode);
        let label = rootName + mode;

        // Add probability if ambiguous or transitional
        if (region.isAmbiguous && w > 60) {
          label += ` ${Math.round(prob * 100)}%`;
        }

        // Add "?" suffix for ambiguous regions
        if (region.isAmbiguous && w <= 60) {
          label += '?';
        }

        ctx.fillStyle = keyTextColor(root, prob);
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + 4, height / 2, w - 8);
      }
    }

    // Draw transition gradients between adjacent regions with different keys
    for (let ri = 0; ri < regions.length - 1; ri++) {
      const curr = regions[ri];
      const next = regions[ri + 1];
      if (curr.bestKey.root === next.bestKey.root && curr.bestKey.mode === next.bestKey.mode) continue;

      const boundaryTick = curr.endTick;
      const bx = (boundaryTick - scrollX) * pixelsPerTick;
      if (bx < -10 || bx > width + 10) continue;

      // Small gradient overlay at boundary
      const gradW = 8;
      const grad = ctx.createLinearGradient(bx - gradW / 2, 0, bx + gradW / 2, 0);
      const c1 = KEY_COLORS[curr.bestKey.root] ?? { h: 210, s: 50, l: 50 };
      const c2 = KEY_COLORS[next.bestKey.root] ?? { h: 210, s: 50, l: 50 };
      grad.addColorStop(0, `hsla(${c1.h}, ${c1.s}%, ${c1.l}%, 0)`);
      grad.addColorStop(0.5, `hsla(0, 0%, 20%, 0.6)`);
      grad.addColorStop(1, `hsla(${c2.h}, ${c2.s}%, ${c2.l}%, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(bx - gradW / 2, 1, gradW, height - 2);
    }

    ctx.textBaseline = 'alphabetic';
  }, [width, height, scrollX, pixelsPerTick, regions, isAtonal, hoverRegionIdx]);

  // Mouse move: hover detection
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;

    let found: number | null = null;
    for (let ri = 0; ri < regions.length; ri++) {
      const region = regions[ri];
      const x = (region.startTick - scrollX) * pixelsPerTick;
      const w = (region.endTick - region.startTick) * pixelsPerTick;
      if (mx >= x && mx <= x + w) {
        found = ri;
        break;
      }
    }
    setHoverRegionIdx(found);
  };

  const handleMouseLeave = () => {
    setHoverRegionIdx(null);
  };

  // Build tooltip text for hovered region
  let tooltip = '';
  if (hoverRegionIdx !== null && regions[hoverRegionIdx]) {
    const r = regions[hoverRegionIdx];
    const best = keyName(r.bestKey.root, r.bestKey.mode);
    const pct = Math.round(r.bestKeyProbability * 100);
    const bars = r.startBar === r.endBar
      ? `Bar ${r.startBar + 1}`
      : `Bar ${r.startBar + 1}-${r.endBar + 1}`;
    const typeTag = r.type === 'transition' ? ' (transition)' : '';
    tooltip = `${best} ${pct}% | ${bars}${typeTag}`;

    // Show top 3 alternatives
    const alts = r.keyProbabilities.slice(0, 3);
    if (alts.length > 1) {
      const altStrs = alts.map((k) =>
        `${keyName(k.root, k.mode)} ${Math.round(k.probability * 100)}%`
      );
      tooltip = altStrs.join(' / ') + ` | ${bars}${typeTag}`;
    }
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        cursor: 'default',
      }}
      title={tooltip}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    />
  );
};
