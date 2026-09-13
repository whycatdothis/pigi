// @vitest-environment jsdom
import { installViewport } from './jsdomSetup';
import { expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

const ROW_HEIGHT = 32;
const ROW_COUNT = 80;
const VIEWPORT = { width: 1200, height: 320 };

/**
 * The virtual list the session tree is going to be, in miniature.
 *
 * What this pins down is the recipe, not the list: jsdom reports no sizes, so a
 * virtualizer draws nothing until the layout is given a viewport. `installViewport`
 * is what fills it in, and these numbers are what a 320px viewport draws.
 */
function VirtualList(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: ROW_COUNT,
    getScrollElement: () => ref.current,
    estimateSize: () => ROW_HEIGHT,
  });
  return (
    <div ref={ref} style={{ height: VIEWPORT.height, overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div key={item.key} data-probe-row data-probe-start={item.start} />
        ))}
      </div>
    </div>
  );
}

it('draws a window of rows once the layout is given a size', () => {
  installViewport(VIEWPORT);
  const { container } = render(<VirtualList />);

  const rows = [...container.querySelectorAll<HTMLElement>('[data-probe-row]')];
  const starts = rows.map((row) => Number(row.dataset.probeStart));
  // A window, not the list: a screenful at 32px a row, plus whatever overscan the
  // list keeps. Which is what fails if the layout never gets a size.
  expect(starts.length).toBeGreaterThanOrEqual(VIEWPORT.height / ROW_HEIGHT);
  expect(starts.length).toBeLessThan(ROW_COUNT);
  expect(starts).toEqual(starts.map((_, index) => index * ROW_HEIGHT));
  // The scrollable height is arithmetic, not a measurement: every row counts, whether
  // or not it has ever been drawn.
  expect(container.firstElementChild?.firstElementChild).toHaveStyle({
    height: `${ROW_COUNT * ROW_HEIGHT}px`,
  });
});
