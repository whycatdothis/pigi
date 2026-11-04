import { useEffect } from 'react';

/** Cmd/Ctrl+F. Only the visible view enables it: hidden tabs stay mounted. */
export function useFindShortcut(enabled: boolean, onFind: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        onFind();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onFind]);
}
