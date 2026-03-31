import React from 'react';
import { useUiStore } from '../../store/uiStore';

interface SettingsPanelProps {
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const useJazzSymbols = useUiStore((s) => s.useJazzSymbols);
  const setUseJazzSymbols = useUiStore((s) => s.setUseJazzSymbols);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'absolute',
          top: 36,
          left: 8,
          backgroundColor: '#2a2a2e',
          border: '1px solid #444',
          borderRadius: 8,
          padding: '12px 16px',
          minWidth: 220,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif',
          fontSize: 12,
          color: '#ccc',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 600, fontSize: 13, color: '#e0e0e0', marginBottom: 10 }}>
          Settings
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            padding: '4px 0',
          }}
        >
          <input
            type="checkbox"
            checked={useJazzSymbols}
            onChange={(e) => setUseJazzSymbols(e.target.checked)}
            style={{ accentColor: '#5090ff', width: 14, height: 14 }}
          />
          <span>Jazz chord symbols</span>
          <span style={{ color: '#777', fontSize: 11 }}>
            maj7{'\u2192'}{'\u25B3'}7 dim{'\u2192'}{'\u00B0'} m7b5{'\u2192'}{'\u00F8'}7
          </span>
        </label>
      </div>
    </div>
  );
};
