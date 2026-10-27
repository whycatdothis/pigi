import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { MESSAGE_ROW_GAP } from './layoutConstants';

test('the CSS row gap agrees with the row model', () => {
  // The row spacing rules subtract this variable from the rhythm steps, which is
  // only correct while it equals the gap the virtualizer lays rows out with.
  const css = readFileSync(new URL('../assets/main.css', import.meta.url), 'utf8');
  const declared = css.match(/--message-row-gap:\s*(\d+)px/);
  expect(declared?.[1]).toBe(String(MESSAGE_ROW_GAP));
});
