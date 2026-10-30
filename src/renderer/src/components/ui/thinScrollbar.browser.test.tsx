import { useRef } from 'react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';
import { requireElement } from '../../testing/domQuery';
import { ThinScrollbar } from './thinScrollbar';
import '../../assets/main.css';

function ScrollFixture({
  contentHeight,
  onDragStart,
  onDragEnd,
}: {
  contentHeight: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}): React.JSX.Element {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className="relative" style={{ width: 200, height: 100 }}>
      <div
        ref={viewportRef}
        data-testid="viewport"
        tabIndex={0}
        className="no-scrollbar h-full overflow-y-auto"
      >
        <div ref={contentRef} style={{ height: contentHeight }} />
      </div>
      <ThinScrollbar
        viewportRef={viewportRef}
        contentRef={contentRef}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className="absolute top-0 right-0.5 bottom-0"
      />
    </div>
  );
}

function queryParts(container: HTMLElement): {
  viewport: HTMLElement;
  rail: HTMLElement;
  thumb: HTMLElement;
} {
  return {
    viewport: requireElement<HTMLElement>('[data-testid="viewport"]', container),
    rail: requireElement<HTMLElement>('[data-testid="thin-scrollbar"]', container),
    thumb: requireElement<HTMLElement>('[data-testid="thin-scrollbar-thumb"]', container),
  };
}

test('draws a proportional capsule thumb once the content overflows, with no track', async () => {
  const screen = await render(<ScrollFixture contentHeight={50} />);
  expect(screen.container.querySelector('[data-testid="thin-scrollbar"]')).toBeNull();

  await screen.rerender(<ScrollFixture contentHeight={400} />);
  await expect.element(screen.getByTestId('thin-scrollbar')).toBeVisible();

  const { rail, thumb } = queryParts(screen.container);
  expect(rail.getBoundingClientRect().width).toBe(10);
  // 2px clear of the edge, so the thumb never touches the message list's border.
  const frame = rail.parentElement?.getBoundingClientRect();
  expect((frame?.right ?? 0) - rail.getBoundingClientRect().right).toBeCloseTo(2, 1);
  expect(getComputedStyle(rail).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  // 8px thumb, a step above the 6px the platform drew as its thin rail.
  expect(thumb.getBoundingClientRect().width).toBe(8);
  // 100px of viewport over 400px of content: the square root of the visible
  // quarter, so the thumb is 50px rather than 25px.
  expect(thumb.getBoundingClientRect().height).toBe(50);
  // Idle lists keep the thumb out of sight; only scrolling or dragging brings it in.
  expect(getComputedStyle(thumb).opacity).toBe('0');
  // Nothing but the thumb takes a pointer, so the wheel reaches the list.
  expect(getComputedStyle(rail).pointerEvents).toBe('none');
  expect(getComputedStyle(thumb).pointerEvents).toBe('auto');
});

test('mirrors the scroll position without revealing the thumb for a programmatic scroll', async () => {
  const screen = await render(<ScrollFixture contentHeight={400} />);
  await expect.element(screen.getByTestId('thin-scrollbar')).toBeVisible();
  const { viewport, thumb } = queryParts(screen.container);

  // Bottom follow, session restore and jump-to-turn all write scrollTop; the
  // thumb mirrors where it landed, but none of them are the reader.
  viewport.scrollTop = 150;
  await expect.poll(() => thumb.style.transform).toBe('translateY(25px)');
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(getComputedStyle(thumb).opacity).toBe('0');
});

test('keeps the thumb hidden while the list scrolls itself', async () => {
  const screen = await render(<ScrollFixture contentHeight={400} />);
  await expect.element(screen.getByTestId('thin-scrollbar')).toBeVisible();
  const { viewport, rail } = queryParts(screen.container);

  // A streaming transcript writes scrollTop on frame after frame. Nothing may
  // reveal the thumb here, not even once: it would blink on through every
  // long reply.
  const reveals: string[] = [];
  const observer = new MutationObserver(() => reveals.push(rail.dataset.visible ?? ''));
  observer.observe(rail, { attributes: true, attributeFilter: ['data-visible'] });
  const startedAt = performance.now();
  await new Promise<void>((resolve) => {
    const step = (): void => {
      viewport.scrollTop = viewport.scrollTop >= 300 ? 0 : viewport.scrollTop + 10;
      if (performance.now() - startedAt > 1000) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  observer.disconnect();
  expect(reveals).toEqual([]);
});

test('reveals the thumb for the reader’s own scroll and hides it again', async () => {
  const screen = await render(<ScrollFixture contentHeight={400} />);
  await expect.element(screen.getByTestId('thin-scrollbar')).toBeVisible();
  const { viewport, thumb } = queryParts(screen.container);

  await userEvent.wheel(viewport, { delta: { y: 150 } });
  await expect.poll(() => thumb.style.transform).toBe('translateY(25px)');
  await expect.poll(() => getComputedStyle(thumb).opacity).toBe('1');
  await expect.poll(() => getComputedStyle(thumb).opacity, { timeout: 4000 }).toBe('0');
});

test('reveals the thumb when the focused list is scrolled with the keyboard', async () => {
  const screen = await render(<ScrollFixture contentHeight={400} />);
  await expect.element(screen.getByTestId('thin-scrollbar')).toBeVisible();
  const { viewport, thumb } = queryParts(screen.container);

  viewport.focus();
  await userEvent.keyboard('{ArrowDown}');
  await expect.poll(() => thumb.style.transform).not.toBe('translateY(0px)');
  await expect.poll(() => getComputedStyle(thumb).opacity).toBe('1');
});

test('reveals the thumb for a touch drag, which never fires wheel', async () => {
  const screen = await render(<ScrollFixture contentHeight={400} />);
  await expect.element(screen.getByTestId('thin-scrollbar')).toBeVisible();
  const { viewport, thumb } = queryParts(screen.container);

  viewport.dispatchEvent(new TouchEvent('touchmove'));
  viewport.scrollTop = 150;
  await expect.poll(() => getComputedStyle(thumb).opacity).toBe('1');
});

test('keeps the thumb up while it is hovered', async () => {
  const screen = await render(<ScrollFixture contentHeight={400} />);
  await expect.element(screen.getByTestId('thin-scrollbar')).toBeVisible();
  const { thumb } = queryParts(screen.container);

  await userEvent.hover(thumb);
  await expect.poll(() => getComputedStyle(thumb).opacity).toBe('1');
  // Hovering is intent: the thumb takes its full width before the drag starts.
  await expect.poll(() => getComputedStyle(thumb).width).toBe('12px');
  // Well past the idle delay: hovering holds it open.
  await new Promise((resolve) => setTimeout(resolve, 2000));
  expect(getComputedStyle(thumb).opacity).toBe('1');
});

test('drags by the thumb and leaves a click beside it to the list', async () => {
  const onDragStart = vi.fn();
  const onDragEnd = vi.fn();
  const screen = await render(
    <ScrollFixture contentHeight={400} onDragStart={onDragStart} onDragEnd={onDragEnd} />,
  );
  await expect.element(screen.getByTestId('thin-scrollbar')).toBeVisible();
  const { viewport, thumb } = queryParts(screen.container);

  // A click near the right edge is not a jump; the rail does not take it.
  await userEvent.click(viewport, { position: { x: 195, y: 90 } });
  expect(viewport.scrollTop).toBe(0);

  // Dragging the thumb from the top to the bottom of the track carries the
  // viewport to the end of its 300px travel, and reports the drag so bottom
  // follow can let go and be re-derived.
  await userEvent.dragAndDrop(thumb, viewport, { targetPosition: { x: 195, y: 90 } });
  expect(viewport.scrollTop).toBe(300);
  expect(onDragStart).toHaveBeenCalledOnce();
  expect(onDragEnd).toHaveBeenCalledOnce();
});

test('thickens the thumb while it is dragged', async () => {
  const screen = await render(<ScrollFixture contentHeight={400} />);
  await expect.element(screen.getByTestId('thin-scrollbar')).toBeVisible();
  const { rail, thumb } = queryParts(screen.container);

  expect(getComputedStyle(thumb).width).toBe('8px');
  // Mid-drag is not observable through the drag helper, so this pins the
  // stylesheet contract the drag relies on.
  rail.setAttribute('data-dragging', 'true');
  await expect.poll(() => getComputedStyle(thumb).width).toBe('12px');
  rail.setAttribute('data-dragging', 'false');
  await expect.poll(() => getComputedStyle(thumb).width).toBe('8px');
});
