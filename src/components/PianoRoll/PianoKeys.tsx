import React from 'react';
import { pitchToNoteName, pitchClass } from '../../utils/music';

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const PIANO_KEY_WIDTH = 56;
const BLACK_KEY_WIDTH = 34;

interface PianoKeysProps {
  scrollY: number;
  pixelsPerSemitone: number;
  canvasHeight: number;
}

export const PianoKeys: React.FC<PianoKeysProps> = ({
  scrollY,
  pixelsPerSemitone,
  canvasHeight,
}) => {
  const keys: React.ReactNode[] = [];
  const visiblePitches = Math.ceil(canvasHeight / pixelsPerSemitone) + 2;

  // White keys background layer, then black keys on top — like a real piano
  for (let i = -1; i <= visiblePitches; i++) {
    const pitch = Math.floor(scrollY) + i;
    if (pitch < 0 || pitch > 127) continue;

    const yOffset = scrollY - Math.floor(scrollY);
    const y = canvasHeight - (pitch - Math.floor(scrollY) + 1) * pixelsPerSemitone + yOffset * pixelsPerSemitone;
    const pc = pitchClass(pitch);
    const isBlack = BLACK_KEYS.has(pc);
    const isC = pc === 0;

    if (isBlack) {
      // Black key: shorter, darker, overlaid
      keys.push(
        <div
          key={pitch}
          style={{
            position: 'absolute',
            top: y,
            left: 0,
            width: BLACK_KEY_WIDTH,
            height: pixelsPerSemitone,
            backgroundColor: '#1a1a1a',
            borderBottom: '1px solid #111',
            borderRight: '1px solid #111',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 4,
            boxSizing: 'border-box',
            userSelect: 'none',
          }}
        />
      );
    } else {
      // White key
      keys.push(
        <div
          key={pitch}
          style={{
            position: 'absolute',
            top: y,
            left: 0,
            width: PIANO_KEY_WIDTH,
            height: pixelsPerSemitone,
            backgroundColor: isC ? '#d8d8d8' : '#c8c8c8',
            borderBottom: `1px solid ${isC ? '#999' : '#aaa'}`,
            borderRight: '1px solid #888',
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 6,
            boxSizing: 'border-box',
            userSelect: 'none',
          }}
        >
          {isC && (
            <span style={{
              fontSize: 9,
              fontWeight: 600,
              color: '#555',
              fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif',
              letterSpacing: -0.3,
            }}>
              {pitchToNoteName(pitch)}
            </span>
          )}
        </div>
      );
    }
  }

  return (
    <div style={{
      position: 'relative',
      width: PIANO_KEY_WIDTH,
      height: canvasHeight,
      overflow: 'hidden',
      flexShrink: 0,
      backgroundColor: '#b0b0b0',
      borderRight: '2px solid #555',
    }}>
      {keys}
    </div>
  );
};
