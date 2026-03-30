import React, { useEffect, useState } from 'react';
import { Toolbar } from './components/Layout/Toolbar';
import { TransportBar } from './components/Layout/TransportBar';
import { PianoRoll } from './components/PianoRoll/PianoRoll';
import { useKeyboard } from './hooks/useKeyboard';
import { usePlayback } from './hooks/usePlayback';
import { useIsMobile } from './hooks/useIsMobile';
import { onSamplerReady, preloadPianoSampler } from './audio/pianoSampler';
import { useUiStore } from './store/uiStore';

// Start loading the piano sampler immediately on app start
preloadPianoSampler();

const DesktopApp: React.FC = () => {
  useKeyboard();
  const { togglePlayback } = usePlayback();
  const setSamplerReady = useUiStore((s) => s.setSamplerReady);

  useEffect(() => {
    onSamplerReady(() => setSamplerReady(true));
  }, [setSamplerReady]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        togglePlayback();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [togglePlayback]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: '#242424',
      color: '#ccc',
      overflow: 'hidden',
      fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif',
    }}>
      <TransportBar />
      <Toolbar />
      <PianoRoll />
    </div>
  );
};

const MobileWarning: React.FC<{ onDismiss: () => void }> = ({ onDismiss }) => (
  <div style={{
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  }}>
    <div style={{
      backgroundColor: '#2a2a2a', borderRadius: 12, padding: '28px 24px',
      border: '1px solid #555', maxWidth: 340, textAlign: 'center',
      fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif',
    }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>🖥️</div>
      <div style={{ color: '#eee', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
        请使用电脑访问
      </div>
      <div style={{ color: '#999', fontSize: 13, marginBottom: 6 }}>
        本应用为桌面端设计，需要键盘和鼠标操作。
      </div>
      <div style={{ color: '#999', fontSize: 13, marginBottom: 20 }}>
        Please use a desktop computer to access this app.
      </div>
      <button
        onClick={onDismiss}
        style={{
          backgroundColor: '#e67e22', color: '#fff', border: 'none',
          borderRadius: 6, padding: '10px 28px', fontSize: 14, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        我已知晓 / I Understand
      </button>
    </div>
  </div>
);

const App: React.FC = () => {
  const isMobile = useIsMobile();
  const [dismissed, setDismissed] = useState(false);

  return (
    <>
      <DesktopApp />
      {isMobile && !dismissed && <MobileWarning onDismiss={() => setDismissed(true)} />}
    </>
  );
};

export default App;
