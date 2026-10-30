import { useRef } from 'react';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';
import { requireElement } from '../../testing/domQuery';
import { ThinScrollbar } from './thinScrollbar';
import '../../assets/main.css';

function ScrollFixture({ contentHeight }: { contentHeight: number }): React.JSX.Element {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className="relative" style={{ width: 200, height: 100 }}>
      <div ref={viewportRef} data-testid="viewport" className="no-scrollbar h-full overflow-y-auto">
        <div ref={contentRef} style={{ height: contentHeight }} />
      </div>
      <ThinScrollbar
        viewportRef={viewportRef}
        contentRef={contentRef}
        className="absolute top-0 right-0 bottom-0"
      />
    </div>
  );
}

test('draws a 6px rail with a proportional thumb once the content overflows', async () => {
  const screen = await render(<ScrollFixture contentHeight={50} />);
  expect(screen.container.querySelector('[data-testid="thin-scrollbar"]')).toBeNull();

  await screen.rerender(<ScrollFixture contentHeight={400} />);
  await expect.element(screen.getByTestId('thin-scrollbar')).toBeVisible();

  const viewport = requireElement<HTMLElement>('[data-testid="viewport"]', screen.container);
  const rail = requireElement<HTMLElement>('[data-testid="thin-scrollbar"]', screen.container);
  const thumb = requireElement<HTMLElement>(
    '[data-testid="thin-scrollbar-thumb"]',
    screen.container,
  );

  expect(rail.getBoundingClientRect().width).toBe(6);
  // 100px of viewport over 400px of content: viewport² / content = 25px.
  expect(thumb.getBoundingClientRect().height).toBe(25);

  viewport.scrollTop = 150;
  await expect.poll(() => thumb.style.transform).toBe('translateY(37.5px)');
});

test('jumps on a track click and drags by the thumb', async () => {
  const screen = await render(<ScrollFixture contentHeight={400} />);
  await expect.element(screen.getByTestId('thin-scrollbar')).toBeVisible();

  const viewport = requireElement<HTMLElement>('[data-testid="viewport"]', screen.container);
  const rail = requireElement<HTMLElement>('[data-testid="thin-scrollbar"]', screen.container);
  const thumb = requireElement<HTMLElement>(
    '[data-testid="thin-scrollbar-thumb"]',
    screen.container,
  );

  // A click on the track near the bottom: the ratio passes 1 and clamps to
  // the end of the 300px travel.
  await userEvent.click(rail, { position: { x: 3, y: 90 } });
  expect(viewport.scrollTop).toBe(300);

  // Dragging from the thumb (now at the bottom) back to the top of the rail
  // carries the viewport back to the start.
  await userEvent.dragAndDrop(thumb, rail, { targetPosition: { x: 3, y: 12 } });
  expect(viewport.scrollTop).toBe(0);
});
