import React, { useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUiStore } from '../../store/uiStore';
import { importMidi, exportMidi } from '../../utils/midi';

export const TransportBar: React.FC = () => {
  const project = useProjectStore((s) => s.project);
  const loadProject = useProjectStore((s) => s.loadProject);
  const setTempo = useProjectStore((s) => s.setTempo);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bpm = project.tempoChanges[0]?.bpm ?? 120;

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const proj = await importMidi(file);
      loadProject(proj);
    } catch (err) {
      console.error('Failed to import MIDI:', err);
      alert('MIDI 导入失败');
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

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '6px 12px',
        backgroundColor: '#252525',
        borderBottom: '1px solid #444',
      }}
    >
      {/* BPM */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: '#888', fontSize: 11 }}>BPM:</span>
        <input
          type="number"
          value={bpm}
          onChange={(e) => setTempo(Number(e.target.value))}
          min={20}
          max={400}
          style={{
            width: 50,
            backgroundColor: '#333',
            color: '#ccc',
            border: '1px solid #555',
            borderRadius: 3,
            padding: '2px 4px',
            fontSize: 12,
            textAlign: 'center',
          }}
        />
      </div>

      {/* Undo/Redo */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={undo}
          disabled={project.history.length === 0}
          title="撤销 (Ctrl+Z)"
          style={btnStyle(project.history.length > 0)}
        >
          撤销
        </button>
        <button
          onClick={redo}
          disabled={project.redoStack.length === 0}
          title="重做 (Ctrl+Shift+Z)"
          style={btnStyle(project.redoStack.length > 0)}
        >
          重做
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
      <button
        onClick={() => fileInputRef.current?.click()}
        style={btnStyle(true)}
      >
        导入 MIDI
      </button>
      <button onClick={handleExport} style={btnStyle(true)}>
        导出 MIDI
      </button>

      <span style={{ color: '#666', fontSize: 11 }}>{project.name}</span>
    </div>
  );
};

function btnStyle(enabled: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    backgroundColor: '#333',
    color: enabled ? '#ccc' : '#555',
    border: '1px solid #444',
    borderRadius: 4,
    cursor: enabled ? 'pointer' : 'default',
    fontSize: 12,
  };
}
