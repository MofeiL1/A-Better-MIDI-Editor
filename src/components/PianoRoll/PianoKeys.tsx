import React from 'react';
import { pitchToNoteName, isInScale, isRoot, pitchClass } from '../../utils/music';

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]); // C#, D#, F#, G#, A#

interface PianoKeysProps {
  scrollY: number;
  pixelsPerSemitone: number;
  canvasHeight: number;
  scaleRoot: number;
  scaleMode: string;
}

export const PianoKeys: React.FC<PianoKeysProps> = ({
  scrollY,
  pixelsPerSemitone,
  canvasHeight,
  scaleRoot,
  scaleMode,
}) => {
  const keys: React.ReactNode[] = [];
  const visiblePitches = Math.ceil(canvasHeight / pixelsPerSemitone);

  for (let i = 0; i <= visiblePitches + 1; i++) {
    const pitch = scrollY + i;
    if (pitch < 0 || pitch > 127) continue;

    const y = canvasHeight - (pitch - scrollY + 1) * pixelsPerSemitone;
    const isBlack = BLACK_KEYS.has(pitchClass(pitch));
    const inScale = isInScale(pitch, scaleRoot, scaleMode);
    const isRootNote = isRoot(pitch, scaleRoot);

    let bg = isBlack ? '#2a2a2a' : '#3a3a3a';
    if (isRootNote) bg = '#4a3a2a';
    else if (inScale && !isBlack) bg = '#333a33';
    else if (inScale && isBlack) bg = '#2a332a';

    keys.push(
      <div
        key={pitch}
        style={{
          position: 'absolute',
          top: y,
          left: 0,
          width: 60,
          height: pixelsPerSemitone,
          backgroundColor: bg,
          borderBottom: '1px solid #555',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 6,
          fontSize: 10,
          color: isRootNote ? '#ffcc66' : inScale ? '#bbb' : '#666',
          fontWeight: isRootNote ? 700 : 400,
          boxSizing: 'border-box',
          userSelect: 'none',
        }}
      >
        {pitchClass(pitch) === 0 || isRootNote ? pitchToNoteName(pitch) : ''}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: 60, height: canvasHeight, overflow: 'hidden', flexShrink: 0 }}>
      {keys}
    </div>
  );
};
