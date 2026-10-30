import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { TranscriptNode, UserNode } from '../../state/transcriptController';
import {
  MESSAGE_LIST_HORIZONTAL_PADDING,
  MESSAGE_LIST_MAX_WIDTH,
  OVERLAY_BG,
  VIBRANCY_OVERLAY_CONTENT,
} from '../../lib/layoutConstants';
import { cn } from '../../lib/utils';
import { computeTickLayout, TICK_EDGE_INSET_DEVICE_PX } from './minimapTickLayout';

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
const EMPTY_MESSAGE_PREVIEW = 'Empty message';
const LINE_WIDTH_MAX_CAP = 32;
const LINE_WIDTH_RIGHT_MARGIN = 8;
const LINE_WIDTH_MIN_CAP = 8;
function useDevicePixelRatio(): number {
  const [devicePixelRatio, setDevicePixelRatio] = useState(() => window.devicePixelRatio || 1);

  useEffect(() => {
    const update = (): void => setDevicePixelRatio(window.devicePixelRatio || 1);
    // A zoom and a move to another display both change this resolution query;
    // `resize` re-reads the ratio in the cases where the query fires late.
    const media = window.matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    media.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, [devicePixelRatio]);

  return devicePixelRatio;
}

const UNIFORM_TICK_COUNT = 6;

/**
 * Tick width by position. The curve peaks in the middle, a shape that only reads
 * once there are enough lines to trace it: below seven messages every bar is a
 * third of the column, short enough to read as a stack rather than a block.
 */
function getLineWidth(index: number, total: number, maxWidth: number): number {
  if (total <= UNIFORM_TICK_COUNT) return Math.round(maxWidth / 3);

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
  // The panel mounts on the first open and stays mounted: `display` is what
  // hides it (see `.message-minimap-panel`), and a list of a few hundred rows
  // is cheaper to keep than to rebuild on every hover.
  const [hasOpened, setHasOpened] = useState(false);
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

  const devicePixelRatio = useDevicePixelRatio();
  // The drawing is only as wide as its widest bar: the trigger is what the mouse
  // has to hit, and an invisible column four times the width of the rail would
  // open the panel from empty space.
  const widestLine = useMemo(
    () =>
      userMessages.reduce(
        (widest, _message, position) =>
          Math.max(widest, getLineWidth(position, userMessages.length, maxLineWidth)),
        0,
      ),
    [userMessages, maxLineWidth],
  );
  const tickLayout = computeTickLayout(devicePixelRatio, userMessages.length, widestLine);

  const openPanel = useCallback((): void => {
    setHasOpened(true);
    setOpen(true);
  }, []);

  /** Closes the panel. The element stays: its own `display`/`opacity`
   *  transition is the whole exit. */
  const closePanel = useCallback((): void => {
    setOpen(false);
    setHoveredIndex(null);
  }, []);

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
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={hasOpened ? panelId : undefined}
        aria-label="Jump to a message"
        onClick={handleTriggerClick}
        className={`block rounded-l bg-transparent py-2 pl-1 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring ${
          open ? 'opacity-0' : ''
        }`}
      >
        {/* `none`, not the default `meet`: it maps the viewBox onto the box
            exactly, so one user unit stays one device pixel even when the used
            size rounds; it would squash the lines if the box ever got a maximum. */}
        <svg
          aria-hidden="true"
          className="block"
          width={tickLayout.viewWidth / tickLayout.devicePixelRatio}
          height={tickLayout.viewHeight / tickLayout.devicePixelRatio}
          viewBox={`0 0 ${tickLayout.viewWidth} ${tickLayout.viewHeight}`}
          preserveAspectRatio="none"
        >
          {userMessages.map(({ node }, position) => {
            const width = Math.min(
              tickLayout.viewWidth - TICK_EDGE_INSET_DEVICE_PX * 2,
              Math.round(
                getLineWidth(position, userMessages.length, maxLineWidth) *
                  tickLayout.devicePixelRatio,
              ),
            );
            return (
              <rect
                key={node.id}
                className="transition-colors"
                x={tickLayout.viewWidth - TICK_EDGE_INSET_DEVICE_PX - width}
                y={TICK_EDGE_INSET_DEVICE_PX + position * tickLayout.pitch}
                width={width}
                height={tickLayout.lineHeight}
                rx={tickLayout.lineHeight / 2}
                fill={position === activePosition ? 'var(--system-accent)' : 'var(--minimap-tick)'}
              />
            );
          })}
        </svg>
      </button>
      {/* Docked panel: flush with the list's right edge, covering the lines.
          It is a sibling of the scroll container (see MessageList), so nothing
          between here and the app shell scrolls or clips — an anchored overlay
          stays put and `scrollIntoView` below cannot drag the transcript.
          It follows the trigger in the DOM so Tab reaches the items, and it is
          positioned, so the visual order is unchanged. */}
      {hasOpened && (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label="Messages"
          // Not `data-open`: `VIBRANCY_OVERLAY_CONTENT` styles that attribute,
          // and its `data-open:animate-in` would run a keyframe animation over
          // the transition this class is made of.
          data-panel-open={open}
          // Closed and fading both keep the panel out of hit testing, the tab
          // order and the accessibility tree. `display: none` already does that
          // once the exit is over; `inert` covers the fade itself.
          inert={!open}
          className={cn(
            'message-minimap-panel',
            VIBRANCY_OVERLAY_CONTENT,
            OVERLAY_BG,
            'absolute right-0 top-1/2 max-h-[50vh] w-64 origin-right -translate-y-1/2 flex-col overflow-hidden rounded-l-surface p-0 backdrop-blur-md',
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
