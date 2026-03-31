import React from 'react';
import { useUiStore } from '../../store/uiStore';
import { SCALE_PATTERNS, NOTE_NAMES } from '../../utils/music';
import type { ToolMode, SnapResolution } from '../../types/ui';

const TOOLS: { mode: ToolMode; label: string; shortcut: string }[] = [
  { mode: 'select', label: 'Pointer', shortcut: '1' },
  { mode: 'draw', label: 'Pencil', shortcut: '2' },
  { mode: 'erase', label: 'Eraser', shortcut: '3' },
];

const SNAP_OPTIONS: { value: SnapResolution; label: string }[] = [
  { value: 'smart', label: 'Smart' },
  { value: 1, label: '1/1' },
  { value: 2, label: '1/2' },
  { value: 4, label: '1/4' },
  { value: 8, label: '1/8' },
  { value: 16, label: '1/16' },
  { value: 32, label: '1/32' },
];

const selectStyle: React.CSSProperties = {
  backgroundColor: '#333',
  color: '#ccc',
  border: '1px solid #555',
  borderRadius: 3,
  padding: '2px 6px',
  fontSize: 11,
  fontWeight: 500,
  fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif',
  cursor: 'pointer',
  outline: 'none',
  colorScheme: 'dark',
};

// Discrete zoom levels — 0.125 (default) at exact center (index 4)
const ZOOM_LEVELS = [0.03, 0.05, 0.07, 0.09, 0.125, 0.2, 0.4, 0.8, 2.0];
export const Toolbar: React.FC = () => {
  const { tool, setTool, snapDivision, setSnapDivision, scaleRoot, scaleMode, scaleAutoDetect, setScale, setAutoDetect } = useUiStore();
  const viewport = useUiStore((s) => s.viewport);
  const setViewport = useUiStore((s) => s.setViewport);

  // Find closest zoom level index for current pixelsPerTick
  const currentZoomIndex = ZOOM_LEVELS.reduce((best, level, i) =>
    Math.abs(level - viewport.pixelsPerTick) < Math.abs(ZOOM_LEVELS[best] - viewport.pixelsPerTick) ? i : best, 0);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        padding: '3px 8px',
        backgroundColor: '#2c2c2c',
        borderBottom: '1px solid #1a1a1a',
        fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif',
        minHeight: 28,
      }}
    >
      {/* Tool buttons — Logic Pro style icon bar */}
      <div style={{ display: 'flex', gap: 1 }}>
        {TOOLS.map((t) => (
          <button
            key={t.mode}
            tabIndex={-1}
            onClick={() => setTool(t.mode)}
            title={`${t.label} (${t.shortcut})`}
            style={{
              padding: '3px 10px',
              backgroundColor: tool === t.mode ? '#505050' : 'transparent',
              color: tool === t.mode ? '#fff' : '#999',
              border: 'none',
              borderRadius: 3,
              fontSize: 11,
              fontWeight: 500,
              fontFamily: 'inherit',
              cursor: 'pointer',
              outline: 'none',
              transition: 'background-color 0.1s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 16, backgroundColor: '#444', margin: '0 6px' }} />

      {/* Snap */}
      <span style={{ color: '#777', fontSize: 10, fontWeight: 500 }}>Snap</span>
      <select
        tabIndex={-1}
        value={snapDivision}
        onChange={(e) => {
          const v = e.target.value;
          setSnapDivision(v === 'smart' ? 'smart' : Number(v) as SnapResolution);
        }}
        style={selectStyle}
      >
        {SNAP_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Divider */}
      <div style={{ width: 1, height: 16, backgroundColor: '#444', margin: '0 6px' }} />

      {/* Scale selector */}
      <span style={{ color: '#777', fontSize: 10, fontWeight: 500 }}>Key</span>
      <select
        tabIndex={-1}
        value={scaleAutoDetect ? -1 : scaleRoot}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v === -1) {
            setAutoDetect(true);
          } else {
            setAutoDetect(false);
            setScale(v, scaleMode);
          }
        }}
        style={selectStyle}
      >
        <option value={-1}>Auto{scaleAutoDetect ? ` (${NOTE_NAMES[scaleRoot]})` : ''}</option>
        {NOTE_NAMES.map((name, i) => (
          <option key={i} value={i}>{name}</option>
        ))}
      </select>
      <select
        tabIndex={-1}
        value={scaleMode}
        onChange={(e) => {
          if (scaleAutoDetect) setAutoDetect(false);
          setScale(scaleRoot, e.target.value);
        }}
        style={{
          ...selectStyle,
          ...(scaleAutoDetect ? { color: '#777', fontStyle: 'italic' } : {}),
        }}
        disabled={scaleAutoDetect}
      >
        {Object.keys(SCALE_PATTERNS).map((mode) => (
          <option key={mode} value={mode}>{mode}</option>
        ))}
      </select>
      {scaleAutoDetect && (
        <button
          tabIndex={-1}
          onClick={() => setAutoDetect(false)}
          title="Lock detected key"
          style={{
            padding: '2px 6px',
            backgroundColor: '#3a6b3a',
            color: '#cfc',
            border: '1px solid #4a8a4a',
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            outline: 'none',
            marginLeft: 2,
          }}
        >
          Confirm
        </button>
      )}

      {/* Spacer — push zoom slider to the right */}
      <div style={{ flex: 1 }} />

      {/* Zoom slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* Zoom out icon (small magnifying glass) */}
        <svg width="12" height="12" viewBox="0 0 16 16" style={{ opacity: 0.5 }}>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="#999" strokeWidth="1.5" />
          <line x1="11" y1="11" x2="14.5" y2="14.5" stroke="#999" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="4.5" y1="7" x2="9.5" y2="7" stroke="#999" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <input
          type="range"
          tabIndex={-1}
          min={0}
          max={ZOOM_LEVELS.length - 1}
          step={1}
          value={currentZoomIndex}
          onChange={(e) => {
            const idx = Number(e.target.value);
            const newPpt = ZOOM_LEVELS[idx];
            // Anchor zoom around playhead position (same logic as wheel zoom)
            const playheadTick = useUiStore.getState().playheadTick;
            const scrollX = viewport.scrollX;
            const ppt = viewport.pixelsPerTick;
            const playheadPx = (playheadTick - scrollX) * ppt;
            const newScrollX = Math.max(0, playheadTick - playheadPx / newPpt);
            setViewport({ pixelsPerTick: newPpt, scrollX: newScrollX });
          }}
          title={`Zoom: ${Math.round(viewport.pixelsPerTick * 1000) / 1000}`}
          style={{
            width: 80,
            height: 3,
            accentColor: '#888',
            cursor: 'pointer',
          }}
        />
        {/* Zoom in icon (magnifying glass with +) */}
        <svg width="12" height="12" viewBox="0 0 16 16" style={{ opacity: 0.5 }}>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="#999" strokeWidth="1.5" />
          <line x1="11" y1="11" x2="14.5" y2="14.5" stroke="#999" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="4.5" y1="7" x2="9.5" y2="7" stroke="#999" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="7" y1="4.5" x2="7" y2="9.5" stroke="#999" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
};
