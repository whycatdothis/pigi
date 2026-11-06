/**
 * Chromium leaves the text selection alone when a press lands on
 * `user-select: none`, and that is everything outside message text (list
 * margins, tool blocks, header, composer footer). A native app clears the
 * selection on such a click, so do that here. Handlers that keep the selection
 * on purpose (the Quote button, panel resize handles) cancel the press first.
 */
export function installSelectionDismissal(target: Document = document): () => void {
  const handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || event.defaultPrevented || !(event.target instanceof Element)) {
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }
    if (getComputedStyle(event.target).userSelect === 'none') {
      selection.removeAllRanges();
    }
  };
  target.addEventListener('mousedown', handleMouseDown);
  return () => target.removeEventListener('mousedown', handleMouseDown);
}
