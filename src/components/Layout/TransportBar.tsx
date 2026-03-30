import React, { useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUiStore } from '../../store/uiStore';
import { usePlayback } from '../../hooks/usePlayback';
import { importMidi, exportMidi } from '../../utils/midi';

const pill: React.CSSProperties = {
  padding: '5px 12px',
  backgroundColor: 'rgba(255, 255, 255, 0.06)',
  color: 'rgba(255, 255, 255, 0.8)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: 0.1,
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
};

const pillDisabled: React.CSSProperties = {
  ...pill,
  color: 'rgba(255, 255, 255, 0.25)',
  cursor: 'default',
};

export const TransportBar: React.FC = () => {
  const project = useProjectStore((s) => s.project);
  const loadProject = useProjectStore((s) => s.loadProject);
  const setTempo = useProjectStore((s) => s.setTempo);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const isPlaying = useUiStore((s) => s.isPlaying);
  const setPlayheadTick = useUiStore((s) => s.setPlayheadTick);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { togglePlayback, stop } = usePlayback();

  const bpm = project.tempoChanges[0]?.bpm ?? 120;

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

  const handleStop = () => {
    stop();
    setPlayheadTick(0);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        backgroundColor: 'rgba(30, 30, 30, 0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      {/* Project name */}
      <span style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.9)',
        letterSpacing: -0.2,
        marginRight: 4,
      }}>
        {project.name}
      </span>

      {/* Divider */}
      <div style={{ width: 1, height: 20, backgroundColor: 'rgba(255, 255, 255, 0.06)' }} />

      {/* Playback controls */}
      <div style={{ display: 'flex', gap: 2 }}>
        <button
          onClick={handleStop}
          title="停止"
          style={{
            ...pill,
            padding: '5px 10px',
            fontSize: 14,
          }}
        >
          ⏹
        </button>
        <button
          onClick={togglePlayback}
          title={isPlaying ? '暂停 (Space)' : '播放 (Space)'}
          style={{
            ...pill,
            padding: '5px 10px',
            fontSize: 14,
            backgroundColor: isPlaying ? 'rgba(255, 100, 80, 0.2)' : 'rgba(255, 255, 255, 0.06)',
            borderColor: isPlaying ? 'rgba(255, 100, 80, 0.3)' : 'rgba(255, 255, 255, 0.08)',
          }}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 20, backgroundColor: 'rgba(255, 255, 255, 0.06)' }} />

      {/* BPM */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 6,
        padding: '3px 8px',
        border: '1px solid rgba(255, 255, 255, 0.06)',
      }}>
        <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 11, fontWeight: 500 }}>BPM</span>
        <input
          type="number"
          value={bpm}
          onChange={(e) => setTempo(Number(e.target.value))}
          min={20}
          max={400}
          style={{
            width: 42,
            backgroundColor: 'transparent',
            color: 'rgba(255, 255, 255, 0.85)',
            border: 'none',
            fontSize: 13,
            fontWeight: 500,
            textAlign: 'center',
            outline: 'none',
          }}
        />
      </div>

      {/* Undo/Redo */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={undo}
          disabled={project.history.length === 0}
          style={project.history.length > 0 ? pill : pillDisabled}
          title="撤销 (⌘Z)"
        >
          ↩
        </button>
        <button
          onClick={redo}
          disabled={project.redoStack.length === 0}
          style={project.redoStack.length > 0 ? pill : pillDisabled}
          title="重做 (⌘⇧Z)"
        >
          ↪
        </button>
      </div>

      <div style={{ flex: 1 }} />

      {/* MIDI Import/Export */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi"
        onChange={handleImport}
        style={{ display: 'none' }}
      />
      <button onClick={() => fileInputRef.current?.click()} style={pill}>
        导入
      </button>
      <button onClick={handleExport} style={pill}>
        导出
      </button>
    </div>
  );
};
