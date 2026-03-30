import React, { useEffect } from 'react';
import { Toolbar } from './components/Layout/Toolbar';
import { TransportBar } from './components/Layout/TransportBar';
import { PianoRoll } from './components/PianoRoll/PianoRoll';
import { MobileApp } from './components/mobile/MobileApp';
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

const App: React.FC = () => {
  const isMobile = useIsMobile();
  return isMobile ? <MobileApp /> : <DesktopApp />;
};

export default App;
