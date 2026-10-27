import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAppStore } from '../../state/appStore';
import { normalizeQuoteText } from '../../lib/messageQuotes';
import { isTextField } from '../../lib/focusModality';
import { VIBRANCY_OVERLAY_CONTENT } from '../../lib/layoutConstants';
import { Kbd } from '../ui/kbd';
import QuoteCommentEditor from './QuoteCommentEditor';

/** Styled in assets/searchHighlights.css. */
const QUOTE_HIGHLIGHT_NAME = 'pi-quote-selection';
/** Gap between the selection's end and the floating button or editor. */
const SELECTION_GAP_PX = 6;
/** Keeps the floating UI off the list's edges. */
const EDGE_MARGIN_PX = 8;
const BUTTON_HALF_WIDTH_PX = 40;
/** Pressed while the Quote button shows, opens the comment editor. */
const QUOTE_SHORTCUT_KEY = 'q';
const BUTTON_HEIGHT_PX = 28;
const EDITOR_WIDTH_PX = 320;
/** Rough editor height, only used to decide whether it fits on the preferred side. */
const EDITOR_ESTIMATED_HEIGHT_PX = 120;

/**
 * Where the selection ends (its focus, where the pointer let go), relative to
 * the list's scroll container. `backward` means it was made bottom-up.
 */
interface SelectionAnchor {
  x: number;
  lineTop: number;
  lineBottom: number;
  selectionTop: number;
  selectionBottom: number;
  backward: boolean;
  containerWidth: number;
  containerHeight: number;
}

interface PopoverState {
  mode: 'button' | 'editing';
  text: string;
  range: Range;
  anchor: SelectionAnchor;
}

/** The caret box at the selection's focus, or null when the focus is between elements. */
function focusCaretRect(range: Range, backward: boolean): DOMRect | null {
  const caret = document.createRange();
  if (backward) {
    caret.setStart(range.startContainer, range.startOffset);
  } else {
    caret.setStart(range.endContainer, range.endOffset);
  }
  caret.collapse(true);
  const rect = caret.getClientRects()[0];
  return rect && rect.height > 0 ? rect : null;
}

/**
 * With `pinToEdge`, a range scrolled out of view anchors to the edge it left
 * through, so an open editor stays next to the list's top or bottom instead
 * of floating over unrelated text.
 */
function measureAnchor(
  container: HTMLElement,
  range: Range,
  backward: boolean,
  pinToEdge = false,
): SelectionAnchor | null {
  const containerRect = container.getBoundingClientRect();
  const rangeRect = range.getBoundingClientRect();
  // An empty box means the selected rows were unmounted by the virtualizer.
  if (rangeRect.width === 0 && rangeRect.height === 0) {
    return null;
  }
  const above = rangeRect.bottom < containerRect.top;
  const below = rangeRect.top > containerRect.bottom;
  if (above || below) {
    if (!pinToEdge) {
      return null;
    }
    const edge = above ? 0 : containerRect.height;
    return {
      x: (backward ? rangeRect.left : rangeRect.right) - containerRect.left,
      lineTop: edge,
      lineBottom: edge,
      selectionTop: edge,
      selectionBottom: edge,
      backward,
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
    };
  }
  const caret = focusCaretRect(range, backward);
  const x = caret?.left ?? (backward ? rangeRect.left : rangeRect.right);
  const lineTop = caret?.top ?? (backward ? rangeRect.top : rangeRect.bottom);
  const lineBottom = caret?.bottom ?? lineTop;
  return {
    x: x - containerRect.left,
    lineTop: lineTop - containerRect.top,
    lineBottom: lineBottom - containerRect.top,
    selectionTop: rangeRect.top - containerRect.top,
    selectionBottom: rangeRect.bottom - containerRect.top,
    backward,
    containerWidth: containerRect.width,
    containerHeight: containerRect.height,
  };
}

function sameAnchor(first: SelectionAnchor, second: SelectionAnchor): boolean {
  return (
    first.x === second.x &&
    first.lineTop === second.lineTop &&
    first.lineBottom === second.lineBottom &&
    first.selectionTop === second.selectionTop &&
    first.selectionBottom === second.selectionBottom &&
    first.backward === second.backward &&
    first.containerWidth === second.containerWidth &&
    first.containerHeight === second.containerHeight
  );
}

/** The current selection when it lies inside the container and is at least partly in view. */
function measureSelection(container: HTMLElement): PopoverState | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0).cloneRange();
  if (!container.contains(range.commonAncestorContainer)) {
    return null;
  }
  const text = normalizeQuoteText(selection.toString());
  if (!text) {
    return null;
  }
  const backward =
    selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset;
  const anchor = measureAnchor(container, range, backward);
  return anchor ? { mode: 'button', text, range, anchor } : null;
}

/**
 * Below the focus line for a top-down selection, above it for a bottom-up one.
 * Without room there, it goes to the far edge of the whole selection rather
 * than covering selected lines; failing both, it stays put, clamped in view.
 */
function placementStyle(
  anchor: SelectionAnchor,
  width: number,
  height: number,
): React.CSSProperties {
  const halfWidth = width / 2;
  const left = Math.max(
    EDGE_MARGIN_PX + halfWidth,
    Math.min(anchor.x, anchor.containerWidth - EDGE_MARGIN_PX - halfWidth),
  );
  const maximumTop = anchor.containerHeight - EDGE_MARGIN_PX - height;
  const below = (top: number): React.CSSProperties => ({
    left,
    top,
    transform: 'translateX(-50%)',
  });
  const above = (bottom: number): React.CSSProperties => ({
    left,
    top: bottom,
    transform: 'translate(-50%, -100%)',
  });
  if (anchor.backward) {
    const aboveBottom = anchor.lineTop - SELECTION_GAP_PX;
    if (aboveBottom - height >= EDGE_MARGIN_PX) {
      return above(aboveBottom);
    }
    const belowTop = anchor.selectionBottom + SELECTION_GAP_PX;
    return belowTop <= maximumTop ? below(belowTop) : above(EDGE_MARGIN_PX + height);
  }
  const belowTop = anchor.lineBottom + SELECTION_GAP_PX;
  if (belowTop <= maximumTop) {
    return below(belowTop);
  }
  const aboveBottom = anchor.selectionTop - SELECTION_GAP_PX;
  return aboveBottom - height >= EDGE_MARGIN_PX ? above(aboveBottom) : below(maximumTop);
}

/**
 * Floating "Quote" action for text selected in the message list, which turns
 * into a comment editor. Saved quotes go to the session's quote panel.
 * Positioned against the scroll container, which fills the list's wrapper.
 */
export default function QuoteSelectionPopover({
  containerRef,
  sessionPath,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  sessionPath: string;
}): React.JSX.Element | null {
  const [state, setState] = useState<PopoverState | null>(null);
  // While a drag selection is in progress the button waits for pointerup, so
  // it does not chase the pointer (or autoscroll) across the transcript.
  const selectingRef = useRef(false);

  const updatePosition = useCallback(() => {
    const container = containerRef.current;
    if (!container || selectingRef.current) {
      return;
    }
    // Runs on every scroll frame, including streaming follow, so an unchanged
    // position keeps the previous state and skips the render.
    setState((previous) => {
      // Focusing the comment box moves the document selection away, so the
      // editor follows the range it saved instead.
      if (previous?.mode === 'editing') {
        const anchor = measureAnchor(container, previous.range, previous.anchor.backward, true);
        return anchor && !sameAnchor(anchor, previous.anchor) ? { ...previous, anchor } : previous;
      }
      const next = measureSelection(container);
      return previous &&
        next &&
        next.text === previous.text &&
        sameAnchor(next.anchor, previous.anchor)
        ? previous
        : next;
    });
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    let frame: number | null = null;
    const scheduleUpdate = (): void => {
      if (frame === null) {
        frame = requestAnimationFrame(() => {
          frame = null;
          updatePosition();
        });
      }
    };
    const handlePointerDown = (event: PointerEvent): void => {
      if (event.button === 0) {
        selectingRef.current = true;
      }
    };
    // The selection is final only after the gesture ends, wherever it ends.
    const handlePointerUp = (): void => {
      if (!selectingRef.current) {
        return;
      }
      selectingRef.current = false;
      updatePosition();
    };
    const handleSelectionChange = (): void => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setState((previous) => (previous?.mode === 'editing' ? previous : null));
      }
    };
    // Panels opening or the window resizing reflow the text under the popover.
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(container);
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('keyup', scheduleUpdate);
    container.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    // Dragging selected text starts a native drag, which ends in pointercancel.
    window.addEventListener('pointercancel', handlePointerUp);
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      resizeObserver.disconnect();
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('keyup', scheduleUpdate);
      container.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [containerRef, updatePosition]);

  const showingButton = state?.mode === 'button';
  useEffect(() => {
    if (!showingButton) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      // Only while the list (focused by the selecting drag) or nothing has
      // focus, so keys in a dialog or another panel are left alone.
      const target = event.target;
      const inScope =
        target === document.body ||
        (target instanceof Node && containerRef.current?.contains(target) === true);
      if (
        !inScope ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.isComposing ||
        isTextField(target)
      ) {
        return;
      }
      if (event.key === 'Escape') {
        // Dismisses the button before Escape reaches the window handlers (abort).
        event.preventDefault();
        event.stopPropagation();
        window.getSelection()?.removeAllRanges();
      } else if (event.key.toLowerCase() === QUOTE_SHORTCUT_KEY && !event.repeat) {
        // Also keeps the q from being typed into the editor that opens.
        event.preventDefault();
        event.stopPropagation();
        setState((previous) =>
          previous?.mode === 'button' ? { ...previous, mode: 'editing' } : previous,
        );
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [showingButton, containerRef]);

  // Keep the quoted text visibly marked while the comment box has focus.
  const editingRange = state?.mode === 'editing' ? state.range : null;
  useEffect(() => {
    if (!editingRange) {
      return;
    }
    CSS.highlights.set(QUOTE_HIGHLIGHT_NAME, new Highlight(editingRange));
    return () => {
      CSS.highlights.delete(QUOTE_HIGHLIGHT_NAME);
    };
  }, [editingRange]);

  const handleSave = useCallback(
    (comment: string) => {
      if (state) {
        useAppStore.getState().addQuote(sessionPath, state.text, comment);
      }
      window.getSelection()?.removeAllRanges();
      setState(null);
    },
    [sessionPath, state],
  );

  const handleCancel = useCallback(() => setState(null), []);

  if (!state) {
    return null;
  }

  if (state.mode === 'button') {
    return (
      <button
        type="button"
        data-testid="quote-selection-button"
        className="absolute z-20 flex h-7 items-center gap-1.5 rounded-control bg-popover/88 px-2.5 text-caption font-medium text-popover-foreground shadow-md ring-[0.5px] ring-foreground/25 backdrop-blur-sm transition-colors hover:bg-muted/88"
        style={placementStyle(state.anchor, BUTTON_HALF_WIDTH_PX * 2, BUTTON_HEIGHT_PX)}
        // Keep the text selection alive through the click.
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => setState({ ...state, mode: 'editing' })}
      >
        Quote
        <Kbd className="h-4 min-w-4 text-2xs">Q</Kbd>
      </button>
    );
  }

  return (
    <QuoteCommentEditor
      initialComment=""
      onSave={handleSave}
      onCancel={handleCancel}
      className={cn(VIBRANCY_OVERLAY_CONTENT, 'absolute z-20 p-2 animate-in fade-in-0 zoom-in-95')}
      style={{
        ...placementStyle(state.anchor, EDITOR_WIDTH_PX, EDITOR_ESTIMATED_HEIGHT_PX),
        width: EDITOR_WIDTH_PX,
      }}
    />
  );
}
