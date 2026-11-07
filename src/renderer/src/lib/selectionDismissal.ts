// Horizontal scrollers in chat: code blocks, tool output, wide tables.
const SCROLLER_SELECTOR = 'pre, .markdown-table-wrapper';
const REPAINT_OPACITY = '0.999';

function scrollersIn(range: Range): HTMLElement[] {
  const ancestor = range.commonAncestorContainer;
  const element = ancestor instanceof Element ? ancestor : ancestor.parentElement;
  if (!element) return [];
  const inside = Array.from(element.querySelectorAll<HTMLElement>(SCROLLER_SELECTOR)).filter(
    (scroller) => range.intersectsNode(scroller),
  );
  const around = element.closest<HTMLElement>(SCROLLER_SELECTOR);
  return around ? [around, ...inside] : inside;
}

/**
 * Chromium leaves the text selection alone when a press lands on
 * `user-select: none`, and that is everything outside message text (list
 * margins, tool blocks, header, composer footer). A native app clears the
 * selection on such a click, so do that here. Handlers that keep the selection
 * on purpose (the Quote button, panel resize handles) cancel the press first.
 *
 * Chromium on macOS can also keep showing a cleared selection inside a
 * horizontal scroller: the scroller is its own compositor layer and the
 * selection repaint never reaches the screen, though a page capture is clean.
 * An opacity change does reach it, so the scrollers the old selection crossed
 * get one for two frames.
 */
export function installSelectionDismissal(target: Document = document): () => void {
  const handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || event.defaultPrevented || !(event.target instanceof Element)) {
      return;
    }
    const selection = target.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }
    if (getComputedStyle(event.target).userSelect === 'none') {
      selection.removeAllRanges();
    }
  };

  let selectedRange: Range | null = null;
  const handleSelectionChange = (): void => {
    const selection = target.getSelection();
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
      selectedRange = selection.getRangeAt(0).cloneRange();
      return;
    }
    if (!selectedRange) return;
    const scrollers = scrollersIn(selectedRange);
    selectedRange = null;
    for (const scroller of scrollers) scroller.style.opacity = REPAINT_OPACITY;
    // Two frames: the first callback runs before the nudged frame is drawn.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        for (const scroller of scrollers) scroller.style.opacity = '';
      }),
    );
  };

  target.addEventListener('mousedown', handleMouseDown);
  target.addEventListener('selectionchange', handleSelectionChange);
  return () => {
    target.removeEventListener('mousedown', handleMouseDown);
    target.removeEventListener('selectionchange', handleSelectionChange);
  };
}
