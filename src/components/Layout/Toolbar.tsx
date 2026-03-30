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

export const Toolbar: React.FC = () => {
  const { tool, setTool, snapDivision, setSnapDivision, scaleRoot, scaleMode, setScale } = useUiStore();

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
        value={snapDivision}
        onChange={(e) => setSnapDivision(Number(e.target.value) as SnapResolution)}
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
        value={scaleRoot}
        onChange={(e) => setScale(Number(e.target.value), scaleMode)}
        style={selectStyle}
      >
        {NOTE_NAMES.map((name, i) => (
          <option key={i} value={i}>{name}</option>
        ))}
      </select>
      <select
        value={scaleMode}
        onChange={(e) => setScale(scaleRoot, e.target.value)}
        style={selectStyle}
      >
        {Object.keys(SCALE_PATTERNS).map((mode) => (
          <option key={mode} value={mode}>{mode}</option>
        ))}
      </select>
    </div>
  );
};
