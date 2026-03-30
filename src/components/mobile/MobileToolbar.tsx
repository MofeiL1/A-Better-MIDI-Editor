import React, { useRef } from 'react';
import { useUiStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { usePlayback } from '../../hooks/usePlayback';
import { importMidi, exportMidi } from '../../utils/midi';
import { SCALE_PATTERNS, NOTE_NAMES } from '../../utils/music';
import type { ToolMode, SnapResolution } from '../../types/ui';

const TOOLS: { mode: ToolMode; icon: string }[] = [
  { mode: 'select', icon: '⌖' },
  { mode: 'draw', icon: '✎' },
  { mode: 'erase', icon: '⌫' },
];

const SNAPS: { value: SnapResolution; label: string }[] = [
  { value: 1, label: '1' },
  { value: 2, label: '½' },
  { value: 4, label: '¼' },
  { value: 8, label: '⅛' },
  { value: 16, label: '¹⁄₁₆' },
];

const selectStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.8)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6,
  padding: '4px 4px',
  fontSize: 11,
  fontWeight: 500,
  appearance: 'none',
  WebkitAppearance: 'none',
  cursor: 'pointer',
  minWidth: 36,
  textAlign: 'center' as const,
};

interface MobileToolbarProps {
  editMode: boolean;
  onToggleEditMode: () => void;
}

export const MobileToolbar: React.FC<MobileToolbarProps> = ({ editMode, onToggleEditMode }) => {
  const { tool, setTool, snapDivision, setSnapDivision, scaleRoot, scaleMode, setScale } = useUiStore();
  const project = useProjectStore((s) => s.project);
  const loadProject = useProjectStore((s) => s.loadProject);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const isPlaying = useUiStore((s) => s.isPlaying);
  const setPlayheadTick = useUiStore((s) => s.setPlayheadTick);
  const { togglePlayback, stop } = usePlayback();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const proj = await importMidi(file);
      loadProject(proj);
    } catch (err) {
      console.error('Failed to import MIDI:', err);
    }
    e.target.value = '';
  };

  const handleExport = () => {
    const blob = exportMidi(project);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name || 'export'}.mid`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pillBase: React.CSSProperties = {
    padding: '6px 10px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.7)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    minWidth: 36,
    textAlign: 'center',
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      backgroundColor: 'rgba(22, 22, 22, 0.95)',
      backdropFilter: 'blur(20px)',
    }}>
      {/* Row 1: Transport + project */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        {/* Play controls */}
        <button
          onClick={() => { stop(); setPlayheadTick(0); }}
          style={pillBase}
        >⏹</button>
        <button
          onClick={togglePlayback}
          style={{
            ...pillBase,
            backgroundColor: isPlaying ? 'rgba(255,100,80,0.2)' : pillBase.backgroundColor,
          }}
        >{isPlaying ? '⏸' : '▶'}</button>

        {/* BPM */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderRadius: 6, padding: '3px 6px',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>BPM</span>
          <input
            type="number"
            value={project.tempoChanges[0]?.bpm ?? 120}
            onChange={(e) => useProjectStore.getState().setTempo(Number(e.target.value))}
            style={{
              width: 36, backgroundColor: 'transparent', color: 'rgba(255,255,255,0.85)',
              border: 'none', fontSize: 12, fontWeight: 500, textAlign: 'center', outline: 'none',
            }}
          />
        </div>

        {/* Undo/Redo */}
        <button onClick={undo} style={pillBase}>↩</button>
        <button onClick={redo} style={pillBase}>↪</button>

        <div style={{ flex: 1 }} />

        {/* Import/Export */}
        <input ref={fileInputRef} type="file" accept=".mid,.midi" onChange={handleImport} style={{ display: 'none' }} />
        <button onClick={() => fileInputRef.current?.click()} style={{ ...pillBase, fontSize: 11 }}>导入</button>
        <button onClick={handleExport} style={{ ...pillBase, fontSize: 11 }}>导出</button>
      </div>

      {/* Row 2: Edit tools + scale */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderBottom: editMode ? '1px solid rgba(255, 180, 50, 0.3)' : '1px solid rgba(255,255,255,0.04)',
      }}>
        {/* Edit mode toggle — tool buttons */}
        <div style={{
          display: 'flex',
          backgroundColor: editMode ? 'rgba(255,180,50,0.1)' : 'rgba(255,255,255,0.04)',
          borderRadius: 8,
          padding: 2,
          gap: 1,
          border: editMode ? '1px solid rgba(255,180,50,0.3)' : '1px solid transparent',
          transition: 'all 0.2s ease',
        }}>
          {TOOLS.map((t) => {
            const isActive = editMode && tool === t.mode;
            return (
              <button
                key={t.mode}
                onClick={() => {
                  if (editMode && tool === t.mode) {
                    // Tap active tool again = exit edit mode
                    onToggleEditMode();
                  } else {
                    setTool(t.mode);
                    if (!editMode) onToggleEditMode();
                  }
                }}
                style={{
                  padding: '6px 14px',
                  backgroundColor: isActive ? 'rgba(255,180,50,0.25)' : 'transparent',
                  color: isActive ? 'rgba(255,220,100,0.95)' : 'rgba(255,255,255,0.4)',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 16,
                  transition: 'all 0.15s ease',
                }}
              >
                {t.icon}
              </button>
            );
          })}
        </div>

        {editMode && (
          <button
            onClick={onToggleEditMode}
            style={{
              ...pillBase,
              fontSize: 11,
              backgroundColor: 'rgba(255,180,50,0.15)',
              color: 'rgba(255,220,100,0.9)',
              borderColor: 'rgba(255,180,50,0.3)',
            }}
          >
            完成
          </button>
        )}

        <div style={{ width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.06)' }} />

        {/* Snap */}
        <select value={snapDivision} onChange={(e) => setSnapDivision(Number(e.target.value) as SnapResolution)} style={selectStyle}>
          {SNAPS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        {/* Scale */}
        <select value={scaleRoot} onChange={(e) => setScale(Number(e.target.value), scaleMode)} style={selectStyle}>
          {NOTE_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
        </select>
        <select value={scaleMode} onChange={(e) => setScale(scaleRoot, e.target.value)} style={{ ...selectStyle, minWidth: 50 }}>
          {Object.keys(SCALE_PATTERNS).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
    </div>
  );
};
