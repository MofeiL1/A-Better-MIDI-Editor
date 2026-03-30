import React from 'react';
import { useUiStore } from '../../store/uiStore';
import { SCALE_PATTERNS, NOTE_NAMES } from '../../utils/music';
import type { ToolMode } from '../../types/ui';
import type { SnapResolution } from '../../types/ui';

const TOOLS: { mode: ToolMode; label: string; shortcut: string }[] = [
  { mode: 'select', label: '选择', shortcut: '1' },
  { mode: 'draw', label: '绘制', shortcut: '2' },
  { mode: 'erase', label: '擦除', shortcut: '3' },
];

const SNAP_OPTIONS: { value: SnapResolution; label: string }[] = [
  { value: 1, label: '1拍' },
  { value: 2, label: '1/2拍' },
  { value: 4, label: '1/4拍' },
  { value: 8, label: '1/8拍' },
  { value: 16, label: '1/16拍' },
  { value: 32, label: '1/32拍' },
];

export const Toolbar: React.FC = () => {
  const { tool, setTool, snapDivision, setSnapDivision, scaleRoot, scaleMode, setScale } = useUiStore();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '6px 12px',
        backgroundColor: '#2a2a2a',
        borderBottom: '1px solid #444',
        flexWrap: 'wrap',
      }}
    >
      {/* Tool buttons */}
      <div style={{ display: 'flex', gap: 4 }}>
        {TOOLS.map((t) => (
          <button
            key={t.mode}
            onClick={() => setTool(t.mode)}
            title={`${t.label} (${t.shortcut})`}
            style={{
              padding: '4px 10px',
              backgroundColor: tool === t.mode ? '#555' : '#333',
              color: tool === t.mode ? '#fff' : '#aaa',
              border: tool === t.mode ? '1px solid #888' : '1px solid #444',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Snap */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: '#888', fontSize: 11 }}>吸附:</span>
        <select
          value={snapDivision}
          onChange={(e) => setSnapDivision(Number(e.target.value) as SnapResolution)}
          style={{
            backgroundColor: '#333',
            color: '#ccc',
            border: '1px solid #555',
            borderRadius: 3,
            padding: '2px 4px',
            fontSize: 11,
          }}
        >
          {SNAP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Scale selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: '#888', fontSize: 11 }}>调性:</span>
        <select
          value={scaleRoot}
          onChange={(e) => setScale(Number(e.target.value), scaleMode)}
          style={{
            backgroundColor: '#333',
            color: '#ccc',
            border: '1px solid #555',
            borderRadius: 3,
            padding: '2px 4px',
            fontSize: 11,
          }}
        >
          {NOTE_NAMES.map((name, i) => (
            <option key={i} value={i}>{name}</option>
          ))}
        </select>
        <select
          value={scaleMode}
          onChange={(e) => setScale(scaleRoot, e.target.value)}
          style={{
            backgroundColor: '#333',
            color: '#ccc',
            border: '1px solid #555',
            borderRadius: 3,
            padding: '2px 4px',
            fontSize: 11,
          }}
        >
          {Object.keys(SCALE_PATTERNS).map((mode) => (
            <option key={mode} value={mode}>{mode}</option>
          ))}
        </select>
      </div>
    </div>
  );
};
