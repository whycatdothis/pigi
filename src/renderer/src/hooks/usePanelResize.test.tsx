// @vitest-environment jsdom
/**
 * The drag's state machine: what gets committed, when a collapsible panel
 * collapses and reopens, and the marker and overlay it leaves behind. The
 * geometry is plain arithmetic on pointer positions, so jsdom is enough; the
 * transitions themselves are checked by hand in the app.
 */
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { shownPopovers } from '../testing/jsdomSetup';
import { PANEL_RESIZING_ATTRIBUTE, usePanelResize } from './usePanelResize';

const PROPERTY = '--panel-width';
const START_SIZE = 300;
const MINIMUM = 200;
const MAXIMUM = 500;
const POINTER_ID = 1;
const START_X = 1000;

interface HarnessProps {
  onCommit: (size: number) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
}

function Harness({ onCommit, onCollapsedChange }: HarnessProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleResizeStart = usePanelResize({
    containerRef,
    property: PROPERTY,
    edge: 'right',
    size: START_SIZE,
    getBounds: () => ({ minimum: MINIMUM, maximum: MAXIMUM }),
    onCommit,
    onCollapsedChange,
  });
  return (
    <div ref={containerRef} data-testid="panel">
      <div data-testid="handle" onPointerDown={handleResizeStart} />
    </div>
  );
}

/** Press the handle, move the pointer so the panel would be each size in turn, release. */
function drag(sizes: number[], { release = true } = {}): void {
  fireEvent.pointerDown(screen.getByTestId('handle'), {
    button: 0,
    pointerId: POINTER_ID,
    clientX: START_X,
  });
  for (const size of sizes) {
    moveTo(size);
  }
  if (release) {
    const last = sizes.at(-1) ?? START_SIZE;
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: POINTER_ID,
        clientX: START_X + last - START_SIZE,
      }),
    );
  }
}

function moveTo(size: number): void {
  window.dispatchEvent(
    new PointerEvent('pointermove', {
      pointerId: POINTER_ID,
      clientX: START_X + size - START_SIZE,
    }),
  );
}

const panel = (): HTMLElement => screen.getByTestId('panel');
const overlay = (): Element | null => document.body.querySelector('.cursor-col-resize');

afterEach(cleanup);

describe('usePanelResize', () => {
  it('commits the size clamped to the bounds', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    drag([350, 120]);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(MINIMUM);
    expect(panel().style.getPropertyValue(PROPERTY)).toBe(`${MINIMUM}px`);
  });

  it('never collapses a panel without onCollapsedChange', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    drag([10]);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(MINIMUM);
  });

  it('covers the window and marks the panel only for the drag', () => {
    render(<Harness onCommit={vi.fn()} />);
    drag([250], { release: false });
    expect(overlay()).not.toBeNull();
    expect(shownPopovers).toContain(overlay());
    expect(panel()).toHaveAttribute(PANEL_RESIZING_ATTRIBUTE);
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: POINTER_ID }));
    expect(overlay()).toBeNull();
    expect(panel()).not.toHaveAttribute(PANEL_RESIZING_ATTRIBUTE);
  });

  it('collapses below half the minimum and keeps the previous size', () => {
    const onCommit = vi.fn();
    const onCollapsedChange = vi.fn();
    render(<Harness onCommit={onCommit} onCollapsedChange={onCollapsedChange} />);
    drag([150, 99]);
    expect(onCollapsedChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(onCommit).not.toHaveBeenCalled();
    expect(panel().style.getPropertyValue(PROPERTY)).toBe(`${START_SIZE}px`);
  });

  it('reopens within the same drag and commits from the minimum', () => {
    const onCommit = vi.fn();
    const onCollapsedChange = vi.fn();
    render(<Harness onCommit={onCommit} onCollapsedChange={onCollapsedChange} />);
    drag([90, 150]);
    expect(onCollapsedChange.mock.calls).toEqual([[true], [false]]);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(MINIMUM);
  });

  it('needs a few pixels past the threshold to reopen', () => {
    const onCollapsedChange = vi.fn();
    render(<Harness onCommit={vi.fn()} onCollapsedChange={onCollapsedChange} />);
    drag([99, 104, 99, 109]);
    expect(onCollapsedChange.mock.calls).toEqual([[true], [false]]);
  });

  it('lets the collapse transition play, then marks the reopened panel again', () => {
    render(<Harness onCommit={vi.fn()} onCollapsedChange={vi.fn()} />);
    drag([90], { release: false });
    expect(panel()).not.toHaveAttribute(PANEL_RESIZING_ATTRIBUTE);
    fireEvent.transitionEnd(panel());
    expect(panel()).not.toHaveAttribute(PANEL_RESIZING_ATTRIBUTE);

    moveTo(150);
    expect(panel()).not.toHaveAttribute(PANEL_RESIZING_ATTRIBUTE);
    // A transition ending inside the panel says nothing about its own width.
    fireEvent.transitionEnd(screen.getByTestId('handle'));
    expect(panel()).not.toHaveAttribute(PANEL_RESIZING_ATTRIBUTE);
    fireEvent.transitionEnd(panel());
    expect(panel()).toHaveAttribute(PANEL_RESIZING_ATTRIBUTE);
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: POINTER_ID }));
  });
});
