import React, { useMemo } from 'react';
import { pitchToNoteName, isInScale, isRoot, pitchClass } from '../../utils/music';

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const KEY_WIDTH = 34;

interface MobilePianoKeysProps {
  scrollY: number;
  pixelsPerSemitone: number;
  canvasHeight: number;
  scaleRoot: number;
  scaleMode: string;
}

/**
 * DOM-based piano key column — no canvas, no flicker.
 * Each pitch row is a positioned div.
 */
export const MobilePianoKeys: React.FC<MobilePianoKeysProps> = ({
  scrollY,
  pixelsPerSemitone,
  canvasHeight,
  scaleRoot,
  scaleMode,
}) => {
  const pps = pixelsPerSemitone;
  const visibleCount = Math.ceil(canvasHeight / pps) + 2;

  const rows = useMemo(() => {
    const result: React.ReactNode[] = [];

    for (let i = -1; i <= visibleCount; i++) {
      const pitch = Math.floor(scrollY) + i;
      if (pitch < 0 || pitch > 127) continue;

      // Fractional scroll offset
      const frac = scrollY - Math.floor(scrollY);
      const y = canvasHeight - (pitch - Math.floor(scrollY) + 1 - frac) * pps;

      const isBlack = BLACK_KEYS.has(pitchClass(pitch));
      const inScale = isInScale(pitch, scaleRoot, scaleMode);
      const rootNote = isRoot(pitch, scaleRoot);
      const isC = pitchClass(pitch) === 0;
      const showLabel = isC || rootNote;

      let bg = isBlack ? '#161618' : '#222224';
      if (rootNote) bg = '#332d1e';
      else if (inScale) bg = isBlack ? '#1e2220' : '#262e28';

      result.push(
        <div
          key={pitch}
          style={{
            position: 'absolute',
            top: y,
            left: 0,
            width: KEY_WIDTH,
            height: pps,
            backgroundColor: bg,
            borderBottom: `${isC ? 1 : 0.5}px solid ${isC ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 4,
            boxSizing: 'border-box',
          }}
        >
          {showLabel && pps >= 8 && (
            <span style={{
              fontSize: Math.min(11, pps - 2),
              fontWeight: rootNote ? 600 : 400,
              color: rootNote ? 'rgba(255, 200, 80, 0.9)' : 'rgba(255, 255, 255, 0.5)',
              letterSpacing: -0.3,
              lineHeight: 1,
            }}>
              {pitchToNoteName(pitch)}
            </span>
          )}
          {!showLabel && inScale && pps >= 6 && (
            <div style={{
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: 'rgba(120, 200, 140, 0.3)',
              marginRight: 2,
            }} />
          )}
        </div>
      );
    }
    return result;
  }, [scrollY, pps, canvasHeight, scaleRoot, scaleMode, visibleCount]);

  return (
    <div style={{
      position: 'relative',
      width: KEY_WIDTH,
      height: canvasHeight,
      flexShrink: 0,
      overflow: 'hidden',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      userSelect: 'none',
      WebkitUserSelect: 'none',
    }}>
      {rows}
    </div>
  );
};

export { KEY_WIDTH };
