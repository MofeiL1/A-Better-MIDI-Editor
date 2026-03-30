import React, { useState } from 'react';
import { MobileToolbar } from './MobileToolbar';
import { MobilePianoRoll } from './MobilePianoRoll';

export const MobileApp: React.FC = () => {
  const [editMode, setEditMode] = useState(false);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100dvh', // dvh for mobile viewport
      backgroundColor: '#161616',
      color: 'rgba(255,255,255,0.85)',
      overflow: 'hidden',
      userSelect: 'none',
      WebkitUserSelect: 'none',
    }}>
      <MobileToolbar
        editMode={editMode}
        onToggleEditMode={() => setEditMode((v) => !v)}
      />
      <MobilePianoRoll editMode={editMode} />
    </div>
  );
};
