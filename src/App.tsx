import React from 'react';
import { Toolbar } from './components/Layout/Toolbar';
import { TransportBar } from './components/Layout/TransportBar';
import { PianoRoll } from './components/PianoRoll/PianoRoll';
import { useKeyboard } from './hooks/useKeyboard';

const App: React.FC = () => {
  useKeyboard();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#161616',
        color: 'rgba(255, 255, 255, 0.85)',
        overflow: 'hidden',
      }}
    >
      <TransportBar />
      <Toolbar />
      <PianoRoll />
    </div>
  );
};

export default App;
