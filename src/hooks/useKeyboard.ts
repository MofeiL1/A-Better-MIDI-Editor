import { useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';

export function useKeyboard() {
  const deleteNotes = useProjectStore((s) => s.deleteNotes);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { setTool, selectedNoteIds, clearSelection, activeClipId, clipboard, setClipboard, setSelectedNoteIds, playheadTick, isPlaying, setIsPlaying } = useUiStore.getState();
      const { project, pasteNotes } = useProjectStore.getState();

      // Space: play/stop — always intercept to prevent dropdown/button activation
      if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
        return;
      }

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
