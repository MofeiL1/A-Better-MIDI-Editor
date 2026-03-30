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
        backgroundColor: '#1a1a1a',
        color: '#ccc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace',
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
