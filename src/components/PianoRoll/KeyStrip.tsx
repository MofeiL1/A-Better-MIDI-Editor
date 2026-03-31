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

/** Low confidence threshold — below this, show "?" on the label. */
const UNCERTAIN_THRESHOLD = 0.80;

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
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

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
      ctx.font = `500 9px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;
      ctx.fillStyle = 'rgba(120, 120, 130, 0.6)';
      ctx.textBaseline = 'middle';
      ctx.fillText(isAtonal ? 'atonal' : '', 6, height / 2);
      return;
    }

    // ─── Continuous rendering: no hard boundaries ───
    const y = 1;
    const h = height - 2;

    for (let ri = 0; ri < regions.length; ri++) {
      const region = regions[ri];
      const prob = region.bestKeyProbability;
      const root = region.bestKey.root;
      const c = KEY_COLORS[root] ?? { h: 210, s: 50, l: 50 };
      const isHovered = hoverRegionIdx === ri;

      const regionStartX = (region.startTick - scrollX) * pixelsPerTick;
      const regionEndX = (region.endTick - scrollX) * pixelsPerTick;

      if (regionEndX < 0 || regionStartX > width) continue;

      const baseAlpha = 0.25 + prob * 0.40;
      const alpha = isHovered ? Math.min(0.75, baseAlpha + 0.12) : baseAlpha;

      const prevRegion = ri > 0 ? regions[ri - 1] : null;
      const nextRegion = ri < regions.length - 1 ? regions[ri + 1] : null;
      const hasPrevTransition = prevRegion && (prevRegion.bestKey.root !== root || prevRegion.bestKey.mode !== region.bestKey.mode);
      const hasNextTransition = nextRegion && (nextRegion.bestKey.root !== root || nextRegion.bestKey.mode !== region.bestKey.mode);

      const GRAD_RATIO = 0.25;
      const MAX_GRAD_PX = 60;
      const MIN_GRAD_PX = 12;

      const regionW = regionEndX - regionStartX;

      let leftGradPx = 0;
      if (hasPrevTransition && prevRegion) {
        const prevW = (prevRegion.endTick - prevRegion.startTick) * pixelsPerTick;
        const shorter = Math.min(regionW, prevW);
        leftGradPx = Math.max(MIN_GRAD_PX, Math.min(MAX_GRAD_PX, shorter * GRAD_RATIO));
      }

      let rightGradPx = 0;
      if (hasNextTransition && nextRegion) {
        const nextW = (nextRegion.endTick - nextRegion.startTick) * pixelsPerTick;
        const shorter = Math.min(regionW, nextW);
        rightGradPx = Math.max(MIN_GRAD_PX, Math.min(MAX_GRAD_PX, shorter * GRAD_RATIO));
      }

      // Core fill
      const coreLeft = regionStartX + leftGradPx;
      const coreRight = regionEndX - rightGradPx;
      if (coreRight > coreLeft) {
        ctx.fillStyle = `hsla(${c.h}, ${c.s}%, ${c.l}%, ${alpha})`;
        ctx.fillRect(coreLeft, y, coreRight - coreLeft, h);
      }

      // Left gradient
      if (leftGradPx > 0 && prevRegion) {
        const pc = KEY_COLORS[prevRegion.bestKey.root] ?? { h: 210, s: 50, l: 50 };
        const prevAlpha = 0.25 + prevRegion.bestKeyProbability * 0.40;
        const grad = ctx.createLinearGradient(regionStartX, 0, regionStartX + leftGradPx, 0);
        grad.addColorStop(0, `hsla(${pc.h}, ${pc.s}%, ${pc.l}%, ${prevAlpha})`);
        grad.addColorStop(1, `hsla(${c.h}, ${c.s}%, ${c.l}%, ${alpha})`);
        ctx.fillStyle = grad;
        ctx.fillRect(regionStartX, y, leftGradPx, h);
      } else if (leftGradPx === 0 && regionStartX > 0) {
        ctx.fillStyle = `hsla(${c.h}, ${c.s}%, ${c.l}%, ${alpha})`;
        ctx.fillRect(regionStartX, y, Math.max(0, coreLeft - regionStartX), h);
      }

      // Right gradient
      if (rightGradPx > 0 && nextRegion) {
        const nc = KEY_COLORS[nextRegion.bestKey.root] ?? { h: 210, s: 50, l: 50 };
        const nextAlpha = 0.25 + nextRegion.bestKeyProbability * 0.40;
        const gradStart = regionEndX - rightGradPx;
        const grad = ctx.createLinearGradient(gradStart, 0, regionEndX, 0);
        grad.addColorStop(0, `hsla(${c.h}, ${c.s}%, ${c.l}%, ${alpha})`);
        grad.addColorStop(1, `hsla(${nc.h}, ${nc.s}%, ${nc.l}%, ${nextAlpha})`);
        ctx.fillStyle = grad;
        ctx.fillRect(gradStart, y, rightGradPx, h);
      } else if (rightGradPx === 0) {
        ctx.fillStyle = `hsla(${c.h}, ${c.s}%, ${c.l}%, ${alpha})`;
        ctx.fillRect(Math.max(regionStartX, coreRight), y, regionEndX - Math.max(regionStartX, coreRight), h);
      }
    }

    // ─── Labels ───
    ctx.textBaseline = 'middle';
    for (let ri = 0; ri < regions.length; ri++) {
      const region = regions[ri];
      const x = (region.startTick - scrollX) * pixelsPerTick;
      const w = (region.endTick - region.startTick) * pixelsPerTick;

      if (x + w < 0 || x > width) continue;
      if (w < 20) continue;

      const prob = region.bestKeyProbability;
      const root = region.bestKey.root;
      const c = KEY_COLORS[root] ?? { h: 210, s: 50, l: 50 };

      const fontSize = Math.min(10, height - 4);
      ctx.font = `600 ${fontSize}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;

      const rootName = NOTE_NAMES[root];
      const mode = modeShort(region.bestKey.mode);
      let label = rootName + mode;

      if (prob < UNCERTAIN_THRESHOLD) {
        label += '?';
      }

      const textAlpha = 0.5 + prob * 0.4;
      ctx.fillStyle = `hsla(${c.h}, ${c.s - 10}%, ${c.l + 30}%, ${textAlpha})`;
      ctx.fillText(label, x + 5, height / 2, w - 10);
    }

    ctx.textBaseline = 'alphabetic';
  }, [width, height, scrollX, pixelsPerTick, regions, isAtonal, hoverRegionIdx]);

  // Mouse move: hover detection + tooltip position
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
    if (found !== null) {
      setTooltipPos({ x: e.clientX, y: rect.bottom });
    } else {
      setTooltipPos(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverRegionIdx(null);
    setTooltipPos(null);
  };

  // Build tooltip content for hovered region
  const hoveredRegion = hoverRegionIdx !== null ? regions[hoverRegionIdx] : null;

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{
          width,
          height,
          cursor: 'default',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      {hoveredRegion && tooltipPos && (
        <KeyTooltip region={hoveredRegion} pos={tooltipPos} />
      )}
    </div>
  );
};

/** Custom floating tooltip showing detailed key analysis. */
const KeyTooltip: React.FC<{ region: TonalRegion; pos: { x: number; y: number } }> = ({
  region,
  pos,
}) => {
  const bars = region.startBar === region.endBar
    ? `Bar ${region.startBar + 1}`
    : `Bars ${region.startBar + 1}-${region.endBar + 1}`;

  const top5 = region.keyProbabilities.slice(0, 5);

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y + 4,
        transform: 'translateX(-50%)',
        backgroundColor: '#1e1e22',
        border: '1px solid #3a3a40',
        borderRadius: 6,
        padding: '8px 12px',
        zIndex: 9999,
        pointerEvents: 'none',
        minWidth: 180,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif',
        fontSize: 11,
        color: '#ccc',
        lineHeight: 1.5,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 6, borderBottom: '1px solid #333', paddingBottom: 4 }}>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 12 }}>
          {keyName(region.bestKey.root, region.bestKey.mode)}
        </span>
        <span style={{ color: '#888', marginLeft: 8 }}>{bars}</span>
        {region.isAmbiguous && (
          <span style={{ color: '#f59e0b', marginLeft: 6 }}>ambiguous</span>
        )}
      </div>

      {/* Candidate table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <thead>
          <tr style={{ color: '#777', textAlign: 'left' }}>
            <th style={{ padding: '1px 4px 1px 0', fontWeight: 500 }}>Key</th>
            <th style={{ padding: '1px 4px', fontWeight: 500, textAlign: 'right' }}>Fit</th>
            <th style={{ padding: '1px 4px', fontWeight: 500, textAlign: 'right' }}>Tonic</th>
            <th style={{ padding: '1px 0 1px 4px', fontWeight: 500, textAlign: 'right' }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {top5.map((k, i) => {
            const isBest = i === 0;
            const c = KEY_COLORS[k.root] ?? { h: 210, s: 50, l: 50 };
            return (
              <tr key={`${k.root}-${k.mode}`} style={{ color: isBest ? '#fff' : '#aaa' }}>
                <td style={{
                  padding: '1px 4px 1px 0',
                  fontWeight: isBest ? 600 : 400,
                  color: isBest ? `hsl(${c.h}, ${c.s}%, ${c.l + 20}%)` : '#aaa',
                }}>
                  {keyName(k.root, k.mode)}
                </td>
                <td style={{ padding: '1px 4px', textAlign: 'right', fontFamily: 'monospace' }}>
                  {Math.round(k.fitScore * 100)}%
                </td>
                <td style={{ padding: '1px 4px', textAlign: 'right', fontFamily: 'monospace' }}>
                  {Math.round(k.tonicConfidence * 100)}%
                </td>
                <td style={{
                  padding: '1px 0 1px 4px',
                  textAlign: 'right',
                  fontFamily: 'monospace',
                  fontWeight: isBest ? 600 : 400,
                }}>
                  {Math.round(k.probability * 100)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
