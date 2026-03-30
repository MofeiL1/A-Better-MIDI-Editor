import { useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';

export function useKeyboard() {
  const deleteNotes = useProjectStore((s) => s.deleteNotes);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { setTool, selectedNoteIds, clearSelection, activeClipId } = useUiStore.getState();

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

      // Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const project = useProjectStore.getState().project;
        const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === activeClipId);
        if (clip) {
          useUiStore.getState().setSelectedNoteIds(new Set(clip.notes.map((n) => n.id)));
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
  }, [deleteNotes, undo, redo]);
}
