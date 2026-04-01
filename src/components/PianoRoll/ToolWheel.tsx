import React, { useCallback, useEffect, useState } from 'react';
import type { ToolMode } from '../../types/ui';

interface ToolWheelProps {
  x: number;
  y: number;
  currentTool: ToolMode;
  onSelect: (tool: ToolMode) => void;
  onClose: () => void;
}

const TOOLS: { mode: ToolMode; label: string }[] = [
  { mode: 'select', label: 'Pointer' },
  { mode: 'flex', label: 'Flex' },
  { mode: 'draw', label: 'Pencil' },
];

const RADIUS = 160;
const INNER_RADIUS = 36;
const DEAD_ZONE = INNER_RADIUS; // must move past inner circle to select

// Each tool gets an equal sector
// Order: Pointer (left-upper), Flex (right-upper), Pencil (bottom)
// Divider lines at: top (-PI/2), bottom-right (PI/6), bottom-left (5PI/6)
const ANGLE_OFFSET = -Math.PI / 2 - (2 * Math.PI / 3); // first sector starts at top going left
const SECTOR_ANGLES = TOOLS.map((_, i) => {
  const start = (i / TOOLS.length) * Math.PI * 2 + ANGLE_OFFSET;
  const end = ((i + 1) / TOOLS.length) * Math.PI * 2 + ANGLE_OFFSET;
  const mid = (start + end) / 2;
  return { start, end, mid };
});

function sectorPath(cx: number, cy: number, r1: number, r2: number, startAngle: number, endAngle: number): string {
  const x1o = cx + r2 * Math.cos(startAngle);
  const y1o = cy + r2 * Math.sin(startAngle);
  const x2o = cx + r2 * Math.cos(endAngle);
  const y2o = cy + r2 * Math.sin(endAngle);
  const x1i = cx + r1 * Math.cos(endAngle);
  const y1i = cy + r1 * Math.sin(endAngle);
  const x2i = cx + r1 * Math.cos(startAngle);
  const y2i = cy + r1 * Math.sin(startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${x1o} ${y1o}`,
    `A ${r2} ${r2} 0 ${largeArc} 1 ${x2o} ${y2o}`,
    `L ${x1i} ${y1i}`,
    `A ${r1} ${r1} 0 ${largeArc} 0 ${x2i} ${y2i}`,
    'Z',
  ].join(' ');
}

function ToolIcon({ mode, x, y, active }: { mode: ToolMode; x: number; y: number; active: boolean }) {
  const color = active ? '#fff' : '#bbb';
  const s = 7;
  if (mode === 'select') {
    return (
      <path
        d={`M${x - s * 0.4} ${y - s} L${x - s * 0.4} ${y + s * 0.6} L${x} ${y + s * 0.1} L${x + s * 0.5} ${y + s} L${x + s * 0.8} ${y + s * 0.7} L${x + s * 0.3} ${y - s * 0.1} L${x + s * 0.7} ${y - s * 0.1} Z`}
        fill={color}
      />
    );
  }
  if (mode === 'flex') {
    return (
      <path
        d={`M${x - s * 0.5} ${y - s * 0.7} L${x + s * 0.7} ${y} L${x - s * 0.5} ${y + s * 0.7} Z`}
        fill={color}
      />
    );
  }
  return (
    <path
      d={`M${x + s * 0.6} ${y - s} L${x + s} ${y - s * 0.6} L${x - s * 0.4} ${y + s * 0.5} L${x - s * 0.8} ${y + s} L${x - s * 0.3} ${y + s * 0.6} Z`}
      fill={color}
    />
  );
}

export const ToolWheel: React.FC<ToolWheelProps> = ({ x, y, currentTool, onSelect, onClose }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Pure angle-based detection — no max distance, just direction from center
  const getToolAtAngle = useCallback((mx: number, my: number): number | null => {
    const dx = mx - x;
    const dy = my - y;
    if (Math.hypot(dx, dy) < DEAD_ZONE) return null;
    let angle = Math.atan2(dy, dx);
    // Normalize to [start of first sector, start + 2PI)
    const base = ANGLE_OFFSET;
    let norm = angle - base;
    if (norm < 0) norm += Math.PI * 2;
    const sectorSize = (Math.PI * 2) / TOOLS.length;
    return Math.floor(norm / sectorSize) % TOOLS.length;
  }, [x, y]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setHoveredIndex(getToolAtAngle(e.clientX, e.clientY));
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        const idx = getToolAtAngle(e.clientX, e.clientY);
        if (idx !== null) {
          onSelect(TOOLS[idx].mode);
        }
        onClose();
      }
    };
    const handleContextMenu = (e: Event) => {
      e.preventDefault();
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu, true);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [getToolAtAngle, onSelect, onClose]);

  const svgSize = RADIUS * 2 + 40;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const fadeMid = ((INNER_RADIUS + RADIUS) / 2) / (svgSize / 2); // 50% radius — still opaque
  const fadeEnd = RADIUS / (svgSize / 2);                        // outer edge — fully transparent

  return (
    <div
      style={{
        position: 'fixed',
        left: x - svgSize / 2,
        top: y - svgSize / 2,
        width: svgSize,
        height: svgSize,
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      <svg width={svgSize} height={svgSize}>
        <defs>
          <radialGradient id="wheelFade" cx="50%" cy="50%" r="50%">
            <stop offset={`${fadeMid * 100}%`} stopColor="white" stopOpacity="1" />
            <stop offset={`${fadeEnd * 100}%`} stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="wheelMask">
            <rect width={svgSize} height={svgSize} fill="url(#wheelFade)" />
          </mask>
        </defs>
        {/* Background sectors with fade mask */}
        <g mask="url(#wheelMask)">
          {TOOLS.map((tool, i) => {
            const { start, end } = SECTOR_ANGLES[i];
            const isHovered = hoveredIndex === i;
            const isCurrent = tool.mode === currentTool;
            return (
              <path
                key={tool.mode}
                d={sectorPath(cx, cy, INNER_RADIUS, RADIUS, start, end)}
                fill={isHovered ? '#555' : isCurrent ? '#404040' : '#2a2a2a'}
              />
            );
          })}
        </g>
        {/* Inner circle + sector divider lines (no outer ring) */}
        <circle cx={cx} cy={cy} r={INNER_RADIUS} fill="none" stroke="#555" strokeWidth={0.5} />
        {SECTOR_ANGLES.map(({ start }, i) => {
          const x1 = cx + INNER_RADIUS * Math.cos(start);
          const y1 = cy + INNER_RADIUS * Math.sin(start);
          const x2 = cx + RADIUS * Math.cos(start);
          const y2 = cy + RADIUS * Math.sin(start);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#555" strokeWidth={0.5} />;
        })}
        {/* Icons and labels — always fully opaque */}
        {TOOLS.map((tool, i) => {
          const { mid } = SECTOR_ANGLES[i];
          const isHovered = hoveredIndex === i;
          const isCurrent = tool.mode === currentTool;
          const labelR = INNER_RADIUS + (RADIUS - INNER_RADIUS) * 0.35;
          const iconX = cx + labelR * Math.cos(mid);
          const iconY = cy + labelR * Math.sin(mid);
          return (
            <g key={tool.mode + '-label'}>
              <ToolIcon mode={tool.mode} x={iconX} y={iconY} active={isHovered || isCurrent} />
              <text
                x={iconX}
                y={iconY + 14}
                textAnchor="middle"
                fill={isHovered ? '#fff' : isCurrent ? '#ddd' : '#888'}
                fontSize={9}
                fontFamily="-apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif"
                fontWeight={500}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {tool.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
