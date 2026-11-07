// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { installSelectionDismissal } from './selectionDismissal';

let uninstall = (): void => {};

afterEach(() => {
  uninstall();
  document.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

test('clearing a selection repaints the scrollers it crossed, and only those', async () => {
  document.body.innerHTML =
    '<p id="before">before</p><pre id="crossed">code</pre><p id="after">after</p><pre id="outside">more</pre>';
  uninstall = installSelectionDismissal();
  const crossed = document.getElementById('crossed')!;
  const outside = document.getElementById('outside')!;

  const range = document.createRange();
  range.setStart(document.getElementById('before')!.firstChild!, 0);
  range.setEnd(document.getElementById('after')!.firstChild!, 2);
  document.getSelection()!.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));

  document.getSelection()!.removeAllRanges();
  document.dispatchEvent(new Event('selectionchange'));

  expect(crossed.style.opacity).toBe('0.999');
  expect(outside.style.opacity).toBe('');
  await nextFrame();
  await nextFrame();
  expect(crossed.style.opacity).toBe('');
});

test('a selection inside one code block repaints that block', () => {
  document.body.innerHTML = '<pre id="block"><code>const a = 1;</code></pre>';
  uninstall = installSelectionDismissal();
  const block = document.getElementById('block')!;

  const range = document.createRange();
  range.setStart(block.querySelector('code')!.firstChild!, 0);
  range.setEnd(block.querySelector('code')!.firstChild!, 5);
  document.getSelection()!.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  document.getSelection()!.removeAllRanges();
  document.dispatchEvent(new Event('selectionchange'));

  expect(block.style.opacity).toBe('0.999');
});
