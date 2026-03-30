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
  const { tool, setTool, snapDivision, setSnapDivision, scaleRoot, scaleMode, scaleAutoDetect, setScale, setAutoDetect } = useUiStore();

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
    </div>
  );
};
