import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { requireElement } from '../../testing/domQuery';
// The rail is drawn by the app's own stylesheet and its gutter is measured
// off a real layout, so this can only run in a browser.
import '../../assets/main.css';

/** The custom rail's width in `main.css`. */
const RAIL_WIDTH_PX = 6;

test('reserves the rail width before the list starts to overflow', async () => {
  const screen = await render(
    <div
      data-testid="scroll-box"
      className="sidebar-scrollbar sidebar-scrollbar-stable"
      style={{ width: 200, height: 100, overflowY: 'auto' }}
    >
      <div style={{ height: 20 }} />
    </div>,
  );
  const box = requireElement<HTMLElement>('[data-testid="scroll-box"]', screen.container);
  const shortWidth = box.clientWidth;
  expect(shortWidth).toBe(box.offsetWidth - RAIL_WIDTH_PX);

  await screen.rerender(
    <div
      data-testid="scroll-box"
      className="sidebar-scrollbar sidebar-scrollbar-stable"
      style={{ width: 200, height: 100, overflowY: 'auto' }}
    >
      <div style={{ height: 400 }} />
    </div>,
  );
  expect(box.clientWidth).toBe(shortWidth);
});
