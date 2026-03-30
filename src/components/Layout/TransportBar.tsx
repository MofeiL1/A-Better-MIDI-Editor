import React, { useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUiStore } from '../../store/uiStore';
import { usePlayback } from '../../hooks/usePlayback';
import { parseMidiTracks, buildProjectFromMidi, exportMidi } from '../../utils/midi';
import type { MidiTrackInfo } from '../../utils/midi';
import type { Midi } from '@tonejs/midi';

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
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const setTempo = useProjectStore((s) => s.setTempo);
  const setTimeSignature = useProjectStore((s) => s.setTimeSignature);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const isPlaying = useUiStore((s) => s.isPlaying);
  const playheadTick = useUiStore((s) => s.playheadTick);
  const setPlayheadTick = useUiStore((s) => s.setPlayheadTick);
  const samplerReady = useUiStore((s) => s.samplerReady);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { togglePlayback, stop } = usePlayback();

  // Track picker state for multi-track MIDI import
  const [trackPicker, setTrackPicker] = useState<{
    tracks: MidiTrackInfo[];
    midi: Midi;
    fileName: string;
    selected: Set<number>;
  } | null>(null);

  const bpm = project.tempoChanges[0]?.bpm ?? 120;
  const ticksPerBeat = project.ticksPerBeat;
  const ts = project.timeSignatureChanges[0] ?? { numerator: 4 };
  const ticksPerBar = ticksPerBeat * ts.numerator * (4 / (ts.denominator ?? 4));

  // Format position as Bar.Beat.Tick
  const bar = Math.floor(playheadTick / ticksPerBar) + 1;
  const beat = Math.floor((playheadTick % ticksPerBar) / ticksPerBeat) + 1;
  const tick = Math.floor(playheadTick % ticksPerBeat);
  const posStr = `${bar}.${beat}.${String(tick).padStart(3, '0')}`;

  const finishImport = (proj: ReturnType<typeof buildProjectFromMidi>) => {
    stop();
    loadProject(proj);
    const firstTrack = proj.tracks[0];
    const firstClip = firstTrack?.clips[0];
    const { setActiveTrack, setActiveClip, clearSelection, setPlayheadTick: setPh } = useUiStore.getState();
    setActiveTrack(firstTrack?.id ?? '');
    setActiveClip(firstClip?.id ?? '');
    clearSelection();
    setPh(0);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { midi, tracks } = await parseMidiTracks(file);
      if (tracks.length <= 1) {
        // Single track (or none) — import directly
        finishImport(buildProjectFromMidi(midi, file.name));
      } else {
        // Multiple tracks — show picker
        setTrackPicker({
          tracks,
          midi,
          fileName: file.name,
          selected: new Set(tracks.map((t) => t.index)),
        });
      }
    } catch (err) {
      console.error('Failed to import MIDI:', err);
      alert('Import failed: ' + (err instanceof Error ? err.message : String(err)));
    }
    e.target.value = '';
  };

  const handleTrackPickerConfirm = () => {
    if (!trackPicker) return;
    const proj = buildProjectFromMidi(trackPicker.midi, trackPicker.fileName, Array.from(trackPicker.selected));
    finishImport(proj);
    setTrackPicker(null);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <select
              value={ts.numerator}
              onChange={(e) => setTimeSignature(Number(e.target.value), ts.denominator ?? 4)}
              style={{
                width: 28, backgroundColor: '#1a1a1a', color: '#e0e0e0',
                border: 'none', fontSize: 14, fontWeight: 600,
                fontFamily: '"SF Mono", "Menlo", "Monaco", monospace',
                textAlign: 'center', outline: 'none', cursor: 'pointer',
                colorScheme: 'dark', padding: 0,
              }}
            >
              {[1,2,3,4,5,6,7,8,9,12].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span style={{ color: '#e0e0e0', fontSize: 14, fontWeight: 600, fontFamily: '"SF Mono", monospace' }}>/</span>
            <select
              value={ts.denominator ?? 4}
              onChange={(e) => setTimeSignature(ts.numerator, Number(e.target.value))}
              style={{
                width: 28, backgroundColor: '#1a1a1a', color: '#e0e0e0',
                border: 'none', fontSize: 14, fontWeight: 600,
                fontFamily: '"SF Mono", "Menlo", "Monaco", monospace',
                textAlign: 'center', outline: 'none', cursor: 'pointer',
                colorScheme: 'dark', padding: 0,
              }}
            >
              {[2,4,8,16].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
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

      {/* Project name — editable, styled like LCD panel */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          backgroundColor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 4,
          padding: '3px 10px',
          marginRight: 8,
          cursor: 'text',
        }}
        onMouseEnter={(e) => {
          const icon = e.currentTarget.querySelector('[data-pencil]') as HTMLElement;
          if (icon) icon.style.color = '#ccc';
        }}
        onMouseLeave={(e) => {
          const input = e.currentTarget.querySelector('input');
          if (input && document.activeElement === input) return; // keep bright during focus
          const icon = e.currentTarget.querySelector('[data-pencil]') as HTMLElement;
          if (icon) icon.style.color = '#555';
        }}
        onClick={(e) => {
          const input = e.currentTarget.querySelector('input');
          input?.focus();
        }}
      >
        <svg data-pencil="" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#555', transition: 'color 0.15s', flexShrink: 0, marginLeft: -2, marginRight: 2 }}>
          <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
        </svg>
        <input
          type="text"
          value={project.name}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Untitled"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          onFocus={(e) => {
            const icon = e.currentTarget.parentElement?.querySelector('[data-pencil]') as HTMLElement;
            if (icon) icon.style.color = '#ccc';
          }}
          onBlur={(e) => {
            const icon = e.currentTarget.parentElement?.querySelector('[data-pencil]') as HTMLElement;
            if (icon) icon.style.color = '#555';
          }}
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: '#e0e0e0',
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            width: 120,
            fontFamily: 'inherit',
            padding: 0,
          }}
        />
      </div>

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
      {/* Track picker modal */}
      {trackPicker && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}
          onClick={() => setTrackPicker(null)}
        >
          <div style={{
            backgroundColor: '#2a2a2a', borderRadius: 8, padding: '16px 20px',
            border: '1px solid #555', minWidth: 280, maxWidth: 400,
            color: '#ccc', fontFamily: '-apple-system, "SF Pro Text", sans-serif',
          }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#eee' }}>
              Select tracks to import
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {trackPicker.tracks.map((t) => (
                <label key={t.index} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px',
                  cursor: 'pointer', borderRadius: 4,
                  backgroundColor: trackPicker.selected.has(t.index) ? 'rgba(255,255,255,0.05)' : 'transparent',
                }}>
                  <input
                    type="checkbox"
                    checked={trackPicker.selected.has(t.index)}
                    onChange={() => {
                      const next = new Set(trackPicker.selected);
                      if (next.has(t.index)) next.delete(t.index); else next.add(t.index);
                      setTrackPicker({ ...trackPicker, selected: next });
                    }}
                    style={{ accentColor: '#6af', colorScheme: 'dark' }}
                  />
                  <span style={{ flex: 1, fontSize: 12 }}>
                    {t.name}
                    <span style={{ color: '#888', marginLeft: 6 }}>
                      {t.noteCount} notes · {t.instrument}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                onClick={() => setTrackPicker(null)}
                style={{ ...btnStyle, color: '#999', border: '1px solid #555', padding: '4px 12px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleTrackPickerConfirm}
                disabled={trackPicker.selected.size === 0}
                style={{
                  ...btnStyle, color: '#fff', backgroundColor: '#4a7aff',
                  border: 'none', padding: '4px 14px', borderRadius: 4,
                  opacity: trackPicker.selected.size === 0 ? 0.4 : 1,
                }}
              >
                Import {trackPicker.selected.size > 0 ? `(${trackPicker.selected.size})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
