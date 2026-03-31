import { useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';

export function useKeyboard() {
  const deleteNotes = useProjectStore((s) => s.deleteNotes);
  const moveNotes = useProjectStore((s) => s.moveNotes);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { setTool, selectedNoteIds, clearSelection, activeClipId, clipboard, setClipboard, setSelectedNoteIds, playheadTick } = useUiStore.getState();
      const { project, pasteNotes } = useProjectStore.getState();

      // Space is handled in App.tsx via togglePlayback() — don't duplicate here

      // Tool switching
      if (e.key === '1') { setTool('select'); return; }
      if (e.key === '2') { setTool('draw'); return; }
      if (e.key === '3') { setTool('erase'); return; }

      // Delete selected notes
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNoteIds.size > 0 && activeClipId) {
        deleteNotes(activeClipId, Array.from(selectedNoteIds));
        clearSelection();
        return;
      }

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }

      // Copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        if (selectedNoteIds.size === 0 || !activeClipId) return;
        const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === activeClipId);
        if (!clip) return;
        const copied = clip.notes.filter((n) => selectedNoteIds.has(n.id));
        setClipboard(copied);
        return;
      }

      // Paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        if (clipboard.length === 0 || !activeClipId) return;
        const newIds = pasteNotes(activeClipId, clipboard, playheadTick);
        setSelectedNoteIds(new Set(newIds));
        return;
      }

      // Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === activeClipId);
        if (clip) {
          setSelectedNoteIds(new Set(clip.notes.map((n) => n.id)));
        }
        return;
      }

      // Arrow keys: move selected notes
      if (e.key.startsWith('Arrow') && selectedNoteIds.size > 0 && activeClipId) {
        e.preventDefault();
        const { snapDivision, viewport } = useUiStore.getState();
        const { ticksPerBeat } = useProjectStore.getState().project;
        const ts = useProjectStore.getState().project.timeSignatureChanges[0] ?? { numerator: 4, denominator: 4 };
        // Import getSmartSnapTicks/getSnapTicksFromDivision logic inline
        let snap: number;
        if (snapDivision === 'smart') {
          // Compute smart snap from current zoom
          const ppt = viewport.pixelsPerTick;
          const divisions = [32, 16, 8, 4, 2, 1] as const;
          snap = ticksPerBeat * (ts.numerator ?? 4) * (4 / (ts.denominator ?? 4)); // fallback: 1 bar
          for (const div of divisions) {
            const t = div <= 1
              ? ticksPerBeat * (ts.numerator ?? 4) * (4 / (ts.denominator ?? 4))
              : (ticksPerBeat * 4) / div;
            if (t * ppt >= 20) { snap = t; break; }
          }
        } else {
          snap = snapDivision <= 1
            ? ticksPerBeat * (ts.numerator ?? 4) * (4 / (ts.denominator ?? 4))
            : (ticksPerBeat * 4) / snapDivision;
        }
        const ids = Array.from(selectedNoteIds);
        switch (e.key) {
          case 'ArrowLeft':  moveNotes(activeClipId, ids, -snap, 0); break;
          case 'ArrowRight': moveNotes(activeClipId, ids, snap, 0); break;
          case 'ArrowUp':    moveNotes(activeClipId, ids, 0, e.shiftKey ? 12 : 1); break;
          case 'ArrowDown':  moveNotes(activeClipId, ids, 0, e.shiftKey ? -12 : -1); break;
        }
        return;
      }

      // Escape to clear selection
      if (e.key === 'Escape') {
        clearSelection();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteNotes, moveNotes, undo, redo]);
}
