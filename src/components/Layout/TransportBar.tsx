import React, { useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUiStore } from '../../store/uiStore';
import { usePlayback } from '../../hooks/usePlayback';
import { importMidi, exportMidi } from '../../utils/midi';

const btnStyle: React.CSSProperties = {
  padding: '3px 8px',
  backgroundColor: 'transparent',
  color: '#aaa',
  border: 'none',
  borderRadius: 3,
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif',
  lineHeight: 1,
};

const textBtnStyle: React.CSSProperties = {
  ...btnStyle,
  fontSize: 11,
  fontWeight: 500,
  padding: '3px 10px',
  color: '#999',
};

export const TransportBar: React.FC = () => {
  const project = useProjectStore((s) => s.project);
  const loadProject = useProjectStore((s) => s.loadProject);
  const setTempo = useProjectStore((s) => s.setTempo);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const isPlaying = useUiStore((s) => s.isPlaying);
  const playheadTick = useUiStore((s) => s.playheadTick);
  const setPlayheadTick = useUiStore((s) => s.setPlayheadTick);
  const samplerReady = useUiStore((s) => s.samplerReady);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { togglePlayback, stop } = usePlayback();

  const bpm = project.tempoChanges[0]?.bpm ?? 120;
  const ticksPerBeat = project.ticksPerBeat;
  const ts = project.timeSignatureChanges[0] ?? { numerator: 4 };
  const ticksPerBar = ticksPerBeat * ts.numerator;

  // Format position as Bar.Beat.Tick
  const bar = Math.floor(playheadTick / ticksPerBar) + 1;
  const beat = Math.floor((playheadTick % ticksPerBar) / ticksPerBeat) + 1;
  const tick = Math.floor(playheadTick % ticksPerBeat);
  const posStr = `${bar}.${beat}.${String(tick).padStart(3, '0')}`;

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const proj = await importMidi(file);
      stop();
      loadProject(proj);
      // Reset UI state to point at the new project's first track/clip
      const firstTrack = proj.tracks[0];
      const firstClip = firstTrack?.clips[0];
      const { setActiveTrack, setActiveClip, clearSelection, setPlayheadTick } = useUiStore.getState();
      setActiveTrack(firstTrack?.id ?? '');
      setActiveClip(firstClip?.id ?? '');
      clearSelection();
      setPlayheadTick(0);
    } catch (err) {
      console.error('Failed to import MIDI:', err);
      alert('Import failed: ' + (err instanceof Error ? err.message : String(err)));
    }
    e.target.value = '';
  };

  const handleExport = () => {
    try {
      const blob = exportMidi(project);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name || 'export'}.mid`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed: ' + (err instanceof Error ? err.message : String(err)));
    }
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
        gap: 2,
        padding: '4px 10px',
        backgroundColor: '#2a2a2a',
        borderBottom: '1px solid #1a1a1a',
        fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif',
        minHeight: 32,
      }}
    >
      {/* Transport controls — Logic Pro style */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {/* Rewind */}
        <button onClick={handleStop} title="Go to Beginning" style={btnStyle}>
          ⏮
        </button>
        {/* Play/Pause */}
        <button
          onClick={togglePlayback}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          style={{
            ...btnStyle,
            color: isPlaying ? '#4ade80' : '#aaa',
            fontSize: 15,
          }}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        {/* Stop */}
        <button onClick={handleStop} title="Stop" style={btnStyle}>
          ⏹
        </button>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 18, backgroundColor: '#444', margin: '0 4px' }} />

      {/* LCD Display — Logic Pro signature */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 4,
        padding: '3px 12px',
        minWidth: 200,
      }}>
        {/* Position */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: 8, color: '#666', fontWeight: 500, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Position
          </span>
          <span style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#e0e0e0',
            fontVariantNumeric: 'tabular-nums',
            fontFamily: '"SF Mono", "Menlo", "Monaco", monospace',
            letterSpacing: 0.5,
          }}>
            {posStr}
          </span>
        </div>

        {/* BPM */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: 8, color: '#666', fontWeight: 500, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            BPM
          </span>
          <input
            type="number"
            value={bpm}
            onChange={(e) => setTempo(Number(e.target.value))}
            min={20}
            max={400}
            style={{
              width: 48,
              backgroundColor: 'transparent',
              color: '#e0e0e0',
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: '"SF Mono", "Menlo", "Monaco", monospace',
              textAlign: 'center',
              outline: 'none',
              letterSpacing: 0.5,
            }}
          />
        </div>

        {/* Time Signature */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: 8, color: '#666', fontWeight: 500, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Sig
          </span>
          <span style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#e0e0e0',
            fontFamily: '"SF Mono", "Menlo", "Monaco", monospace',
          }}>
            {ts.numerator}/4
          </span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 18, backgroundColor: '#444', margin: '0 4px' }} />

      {/* Piano sampler loading indicator */}
      {!samplerReady && (
        <span style={{ fontSize: 10, color: '#666', fontWeight: 500, fontStyle: 'italic' }}>
          Loading piano…
        </span>
      )}

      {/* Undo/Redo */}
      <button
        onClick={undo}
        disabled={project.history.length === 0}
        style={{
          ...textBtnStyle,
          color: project.history.length > 0 ? '#aaa' : '#555',
        }}
        title="Undo (Ctrl+Z)"
      >
        ↩
      </button>
      <button
        onClick={redo}
        disabled={project.redoStack.length === 0}
        style={{
          ...textBtnStyle,
          color: project.redoStack.length > 0 ? '#aaa' : '#555',
        }}
        title="Redo (Ctrl+Y)"
      >
        ↪
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Project name */}
      <span style={{
        fontSize: 12,
        fontWeight: 500,
        color: '#888',
        letterSpacing: -0.2,
        marginRight: 8,
      }}>
        {project.name}
      </span>

      {/* MIDI Import/Export */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi"
        onChange={handleImport}
        style={{ display: 'none' }}
      />
      <button onClick={() => fileInputRef.current?.click()} style={textBtnStyle}>
        Import
      </button>
      <button onClick={handleExport} style={textBtnStyle}>
        Export
      </button>
    </div>
  );
};
