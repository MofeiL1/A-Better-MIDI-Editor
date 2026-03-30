import React from 'react';
import { useUiStore } from '../../store/uiStore';
import { SCALE_PATTERNS, NOTE_NAMES } from '../../utils/music';
import type { ToolMode, SnapResolution } from '../../types/ui';

const TOOLS: { mode: ToolMode; label: string; icon: string; shortcut: string }[] = [
  { mode: 'select', label: '选择', icon: '⌖', shortcut: '1' },
  { mode: 'draw', label: '绘制', icon: '✎', shortcut: '2' },
  { mode: 'erase', label: '擦除', icon: '⌫', shortcut: '3' },
];

const SNAP_OPTIONS: { value: SnapResolution; label: string }[] = [
  { value: 1, label: '1' },
  { value: 2, label: '1/2' },
  { value: 4, label: '1/4' },
  { value: 8, label: '1/8' },
  { value: 16, label: '1/16' },
  { value: 32, label: '1/32' },
];

const selectStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255, 255, 255, 0.06)',
  color: 'rgba(255, 255, 255, 0.8)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 6,
  padding: '4px 6px',
  fontSize: 11,
  fontWeight: 500,
  appearance: 'none' as const,
  WebkitAppearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L4 4L7 1' stroke='rgba(255,255,255,0.4)' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 6px center',
  paddingRight: 20,
  cursor: 'pointer',
};

export const Toolbar: React.FC = () => {
  const { tool, setTool, snapDivision, setSnapDivision, scaleRoot, scaleMode, setScale } = useUiStore();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '6px 16px',
        backgroundColor: 'rgba(24, 24, 24, 0.9)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
      }}
    >
      {/* Tool segment control */}
      <div style={{
        display: 'flex',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 8,
        padding: 2,
        gap: 1,
      }}>
        {TOOLS.map((t) => (
          <button
            key={t.mode}
            onClick={() => setTool(t.mode)}
            title={`${t.label} (${t.shortcut})`}
            style={{
              padding: '4px 14px',
              backgroundColor: tool === t.mode ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
              color: tool === t.mode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.4)',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: 0.2,
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ marginRight: 4 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 20, backgroundColor: 'rgba(255, 255, 255, 0.06)' }} />

      {/* Snap */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: 11, fontWeight: 500 }}>吸附</span>
        <select
          value={snapDivision}
          onChange={(e) => setSnapDivision(Number(e.target.value) as SnapResolution)}
          style={selectStyle}
        >
          {SNAP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 20, backgroundColor: 'rgba(255, 255, 255, 0.06)' }} />

      {/* Scale selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: 11, fontWeight: 500 }}>调性</span>
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
    </div>
  );
};
