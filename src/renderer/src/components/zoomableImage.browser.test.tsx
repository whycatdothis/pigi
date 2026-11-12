import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ZoomableImage } from './zoomableImage';

/** A 40px red square: an image small enough that the overlay enlarges it. */
const SQUARE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#d00"/></svg>',
  );

async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(check()).toBe(true);
}

/** The pan library's own scale, written into the element it transforms. */
function panScale(): number {
  const component = document.querySelector<HTMLElement>('.react-transform-component');
  const match = /scale\(([^)]+)\)/.exec(component?.style.transform ?? '');
  return match === null ? Number.NaN : Number(match[1]);
}

function shownBox(): DOMRect | null {
  const shown = document.querySelector('[data-rmiz-modal-img]');
  return shown === null ? null : shown.getBoundingClientRect();
}

test('opens an image at the size the overlay fits it to, not at its own', async () => {
  const screen = await render(
    <ZoomableImage src={SQUARE} alt="a red square" width={40} height={40} />,
  );
  const image = screen.container.querySelector('img');
  if (!image) throw new Error('no image is on the page');

  await userEvent.click(image);
  await waitFor(() => document.querySelector('[data-rmiz-modal]')?.hasAttribute('open') === true);
  let width = -1;
  await waitFor(() => {
    const next = shownBox()?.width ?? 0;
    const settled = next === width;
    width = next;
    return settled;
  });

  // A drawing is enlarged to its own size when the block had shrunk it; an image
  // is not — the overlay's fit of an image is an enlargement already, and the
  // reader's own zooming starts from it.
  expect(panScale()).toBe(1);
  expect(shownBox()?.width ?? 0).toBeGreaterThan(40);
});
