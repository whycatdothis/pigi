import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { TranscriptNode, UserNode } from '../../state/transcriptController';
import {
  MESSAGE_LIST_HORIZONTAL_PADDING,
  MESSAGE_LIST_MAX_WIDTH,
  OVERLAY_BG,
  VIBRANCY_OVERLAY_CONTENT,
} from '../../lib/layoutConstants';
import { cn } from '../../lib/utils';

interface UserMessageMiniMapProps {
  nodes: TranscriptNode[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Index in the displayNodes array of the user message closest to viewport center */
  activeUserMessageIndex: number;
  onScrollToIndex: (index: number) => void;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

const HOVER_OPEN_DELAY = 200;
const HOVER_CLOSE_DELAY = 300;
/** Slack on top of the exit animation before the fuse fires; see the effect. */
const EXIT_FUSE_SLACK = 200;
const EMPTY_MESSAGE_PREVIEW = 'Empty message';
const LINE_WIDTH_MAX_CAP = 48;
const LINE_WIDTH_RIGHT_MARGIN = 8;
const LINE_WIDTH_MIN_CAP = 8;

/** `animation-duration` lists one value per animation; the exit runs one. */
function firstDurationMs(durations: string): number {
  const [first = ''] = durations.split(',');
  const value = first.trim();
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) return 0;
  return value.endsWith('ms') ? amount : amount * 1000;
}

/** Returns a width based on message count and position. */
function getLineWidth(index: number, total: number, maxWidth: number): number {
  if (total <= 1) return maxWidth * 0.4;
  if (total === 2) return Math.round(maxWidth * 0.5);

  if (total <= 5) {
    // Few messages: linear from min to ~60% of max at center
    const normalized = index / (total - 1);
    const distFromCenter = 1 - Math.abs(normalized * 2 - 1);
    const target = maxWidth * 0.6;
    return Math.round(LINE_WIDTH_MIN_CAP + distFromCenter * (target - LINE_WIDTH_MIN_CAP));
  }

  if (total <= 10) {
    // Medium count: quadratic curve, center reaches ~80% of max
    const normalized = index / (total - 1);
    const distFromCenter = 1 - Math.abs(normalized * 2 - 1);
    const factor = distFromCenter * distFromCenter;
    return Math.round(LINE_WIDTH_MIN_CAP + factor * (maxWidth * 0.8 - LINE_WIDTH_MIN_CAP));
  }

  // Many messages: quadratic curve, center reaches max
  const normalized = index / (total - 1);
  const distFromCenter = 1 - Math.abs(normalized * 2 - 1);
  const factor = distFromCenter * distFromCenter;
  return Math.round(LINE_WIDTH_MIN_CAP + factor * (maxWidth - LINE_WIDTH_MIN_CAP));
}

export default React.memo(function UserMessageMiniMap({
  nodes,
  containerRef,
  activeUserMessageIndex,
  onScrollToIndex,
}: UserMessageMiniMapProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  // The panel outlives `open` by one animation so closing is not a hard cut
  // while the ticks fade back in.
  const [present, setPresent] = useState(false);
  const panelId = useId();
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Set by a keyboard activation: the panel opened under the focused trigger,
   *  so focus follows it in. Hover must not steal focus. */
  const focusFirstItemRef = useRef(false);

  const [maxLineWidth, setMaxLineWidth] = useState(
    MESSAGE_LIST_HORIZONTAL_PADDING - LINE_WIDTH_RIGHT_MARGIN,
  );
  // Width affects only this small overlay, not the transcript. Publish the
  // clamped result so widths beyond the cap do not cause React updates.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const centerGap = Math.max(0, (entry.contentRect.width - MESSAGE_LIST_MAX_WIDTH) / 2);
      const availableSpace = centerGap + MESSAGE_LIST_HORIZONTAL_PADDING;
      setMaxLineWidth(
        Math.max(
          LINE_WIDTH_MIN_CAP,
          Math.min(LINE_WIDTH_MAX_CAP, availableSpace - LINE_WIDTH_RIGHT_MARGIN),
        ),
      );
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const userMessages = useMemo(() => {
    const result: { node: UserNode; index: number; preview: string }[] = [];
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      if (node.role === 'user') {
        // The preview is the first line, and both the row's text and its title
        // show it: splitting here keeps it once per node instead of twice per
        // render, which matters at a few hundred messages.
        result.push({ node, index, preview: node.text.split('\n')[0] || EMPTY_MESSAGE_PREVIEW });
      }
    }
    return result;
  }, [nodes]);

  /** Which position in the userMessages array is currently active */
  const activePosition = useMemo(() => {
    for (let position = 0; position < userMessages.length; position++) {
      if (userMessages[position].index === activeUserMessageIndex) return position;
    }
    return -1;
  }, [userMessages, activeUserMessageIndex]);

  const openPanel = useCallback((): void => {
    setPresent(true);
    setOpen(true);
  }, []);

  /** Closes the panel; the panel itself unmounts when its exit animation ends. */
  const closePanel = useCallback((): void => {
    setOpen(false);
  }, []);

  /** Ends the panel's life. Two callers: the exit animation ending, and the
   *  fuse under it; both mean the same thing, so they share one definition. */
  const finishClose = useCallback((): void => {
    setPresent(false);
    setHoveredIndex(null);
  }, []);

  // A fuse under the exit animation. Unmounting on `animationend` is the
  // mechanism, but it is the only one, and a panel that stays mounted is
  // invisible and, without `inert` below, sits over the transcript's right edge
  // swallowing clicks. The fuse length is read from the running exit rather than
  // copied from a constant, so it cannot drift from the animation. Re-opening
  // during the fade clears it through this effect's cleanup.
  useEffect(() => {
    if (open || !present) return;
    const panel = panelRef.current;
    const exitDuration = panel ? firstDurationMs(getComputedStyle(panel).animationDuration) : 0;
    const fuse = setTimeout(finishClose, exitDuration + EXIT_FUSE_SLACK);
    return () => clearTimeout(fuse);
  }, [open, present, finishClose]);

  /** Activation from the trigger: open, then put focus on the first item.
   *  Returning focus to the trigger on close is only safe because focusing it
   *  does not open the panel — hover does. */
  const handleTriggerClick = useCallback((): void => {
    if (open) {
      closePanel();
      return;
    }
    focusFirstItemRef.current = true;
    openPanel();
  }, [open, closePanel, openPanel]);

  const handleMouseEnter = useCallback((): void => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    openTimerRef.current = setTimeout(openPanel, HOVER_OPEN_DELAY);
  }, [openPanel]);

  const handleMouseLeave = useCallback((): void => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    closeTimerRef.current = setTimeout(closePanel, HOVER_CLOSE_DELAY);
  }, [closePanel]);

  const handleItemHover = useCallback((index: number) => {
    setHoveredIndex(index);
  }, []);

  // Scroll the active item into view once the panel mounts, and move focus into
  // it when it was opened from the keyboard.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      activeItemRef.current?.scrollIntoView({ block: 'center' });
      if (!focusFirstItemRef.current) return;
      focusFirstItemRef.current = false;
      const target =
        activeItemRef.current ?? panelRef.current?.querySelector<HTMLButtonElement>('button');
      target?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Escape closes, as it did when this was a Radix popover (its dismissable
  // layer handled it for us). Focus returns to the trigger rather than to the
  // transcript: the scroll container is an abort scope, so focusing it would
  // turn the next Escape into "stop generating".
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (openTimerRef.current) {
        clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
      const focusInside = minimapRef.current?.contains(document.activeElement) ?? false;
      closePanel();
      if (focusInside) triggerRef.current?.focus();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, closePanel]);

  if (userMessages.length === 0) return null;

  return (
    <div
      ref={minimapRef}
      role="navigation"
      aria-label="Message navigation minimap"
      className="absolute right-0 top-1/2 z-10 -translate-y-1/2 cursor-default"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onBlur={(event) => {
        // Focus leaving the minimap entirely, not just the trigger: the panel is
        // part of it, so moving between the two must not close anything.
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
        closePanel();
      }}
    >
      {/* Line ticks. 1px height + 7px gap = 8px pitch: an integer number of
          device pixels at DPR 1/1.25/1.5/1.75/2, so every line rasterizes at the
          same thickness. The old 1.5px + 6px = 7.5px pitch landed on different
          subpixel phases per line on non-2x displays. */}
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={present ? panelId : undefined}
        aria-label="Jump to a message"
        onClick={handleTriggerClick}
        className={`flex flex-col items-end gap-[7px] rounded-l bg-transparent py-2 pl-1 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring ${
          open ? 'opacity-0' : '[&:not(:hover)]:opacity-60 hover:opacity-90'
        }`}
      >
        {userMessages.map(({ node }, position) => (
          <div
            key={node.id}
            className="rounded-full transition-colors"
            style={{
              width: `${getLineWidth(position, userMessages.length, maxLineWidth)}px`,
              height: '1px',
              backgroundColor:
                position === activePosition
                  ? 'var(--system-accent)'
                  : 'color-mix(in srgb, var(--muted-foreground) 50%, transparent)',
            }}
          />
        ))}
      </button>
      {/* Docked panel: flush with the list's right edge, covering the lines.
          It is a sibling of the scroll container (see MessageList), so nothing
          between here and the app shell scrolls or clips — an anchored overlay
          stays put and `scrollIntoView` below cannot drag the transcript.
          It follows the trigger in the DOM so Tab reaches the items, and it is
          positioned, so the visual order is unchanged. */}
      {present && (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label="Messages"
          // While closing, the panel is still mounted but must not be reachable:
          // `inert` keeps it out of hit testing, the tab order and the
          // accessibility tree for the length of the fade.
          inert={!open}
          onAnimationEnd={(event) => {
            // The exit keyframes end at opacity 0, but `animate-out` does not
            // fill: the moment they finish the panel snaps back to its own
            // (opaque) style and paints one full frame before this handler's
            // unmount commits. `fill-mode-forwards` below holds the final
            // invisible values for that frame, so closing is a fade, not a
            // flash. Unmounting here is still what ends the panel's life.
            if (event.target !== event.currentTarget || open) return;
            finishClose();
          }}
          className={cn(
            VIBRANCY_OVERLAY_CONTENT,
            OVERLAY_BG,
            'absolute right-0 top-1/2 flex max-h-[50vh] w-64 origin-right -translate-y-1/2 flex-col overflow-hidden rounded-l-surface p-0 backdrop-blur-md',
            // fill mode only on the exit: `forwards` holds the last keyframe,
            // which is why closing is a fade instead of a flash. On the enter it
            // would freeze a snapshot of the element's own style taken when the
            // animation started, and keep a finished keyframe effect alive.
            open
              ? 'animate-in fade-in-0 zoom-in-95'
              : 'animate-out fade-out-0 zoom-out-95 fill-mode-forwards',
          )}
        >
          <div className="flex flex-col gap-0.5 overflow-y-auto p-1 scrollbar-none">
            {userMessages.map(({ node, index, preview }, position) => {
              const isActive = position === activePosition;
              const isHovered = hoveredIndex === index;
              return (
                <button
                  key={node.id}
                  ref={isActive ? activeItemRef : undefined}
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-body transition-colors ${
                    isActive || isHovered ? 'bg-[var(--system-accent)]/10' : 'hover:bg-foreground/7'
                  }`}
                  onClick={() => {
                    onScrollToIndex(index);
                    closePanel();
                    // The button unmounts with the panel; hand focus back to the
                    // trigger instead of dropping it on <body>.
                    triggerRef.current?.focus();
                  }}
                  onMouseEnter={() => handleItemHover(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <span
                    className={`min-w-0 flex-1 truncate text-caption ${
                      isActive || isHovered ? 'text-[var(--system-accent)]' : 'text-foreground'
                    }`}
                    title={preview}
                  >
                    {preview}
                  </span>
                  <span className="shrink-0 text-2xs text-muted-foreground">
                    {formatTime(node.sentAt)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
