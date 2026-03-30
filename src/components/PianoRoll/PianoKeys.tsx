import React from 'react';
import { pitchToNoteName, isInScale, isRoot, pitchClass } from '../../utils/music';

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

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
    const isC = pitchClass(pitch) === 0;

    let bg = isBlack ? '#1c1c1e' : '#2c2c2e';
    if (isRootNote) bg = isBlack ? '#2a2518' : '#332d1e';
    else if (inScale) bg = isBlack ? '#1e2220' : '#282e2a';

    const showLabel = isC || isRootNote;
    let labelColor = 'rgba(255, 255, 255, 0.25)';
    if (isRootNote) labelColor = 'rgba(255, 200, 80, 0.9)';
    else if (isC) labelColor = 'rgba(255, 255, 255, 0.5)';

    keys.push(
      <div
        key={pitch}
        style={{
          position: 'absolute',
          top: y,
          left: 0,
          width: 56,
          height: pixelsPerSemitone,
          backgroundColor: bg,
          borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 8,
          fontSize: 10,
          fontWeight: isRootNote ? 600 : 400,
          color: labelColor,
          boxSizing: 'border-box',
          userSelect: 'none',
          letterSpacing: -0.2,
        }}
      >
        {showLabel ? pitchToNoteName(pitch) : ''}
      </div>
    );
  }

  return (
    <div style={{
      position: 'relative',
      width: 56,
      height: canvasHeight,
      overflow: 'hidden',
      flexShrink: 0,
      borderRight: '1px solid rgba(255, 255, 255, 0.06)',
    }}>
      {keys}
    </div>
  );
};
