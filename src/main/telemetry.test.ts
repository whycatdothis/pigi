/**
 * The scrubber is the privacy promise for error reports: whatever an error
 * message or stack names on disk or on the network must not leave the machine.
 * The inputs are shapes real errors take.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {}, ipcMain: {}, net: {} }));

import { scrubErrorText } from './telemetry';

const APP_PATH = '/Applications/My Apps/pigi.app/Contents/Resources/app.asar';

describe('scrubErrorText', () => {
  it('keeps where in the bundle a frame is', () => {
    const stack = [
      'TypeError: x is undefined',
      `    at run (${APP_PATH}/out/main/index.js:120:7)`,
      '    at f (file:///Applications/My%20Apps/pigi.app/Contents/Resources/app.asar/out/renderer/assets/index-abc.js:1:2345)',
    ].join('\n');

    expect(scrubErrorText(stack, APP_PATH)).toBe(
      [
        'TypeError: x is undefined',
        '    at run (<app>/out/main/index.js:120:7)',
        '    at f (<app>/out/renderer/assets/index-abc.js:1:2345)',
      ].join('\n'),
    );
  });

  it('replaces every other path whole, not just the home folder', () => {
    expect(
      scrubErrorText(
        "ENOENT: no such file or directory, open '/Users/ann/work/acme-secret/.env'",
        APP_PATH,
      ),
    ).toBe("ENOENT: no such file or directory, open '<path>'");
    expect(scrubErrorText('Cannot read ~/notes/plan.md', APP_PATH)).toBe('Cannot read <path>');
    expect(scrubErrorText('at x (/Volumes/Data/client/app.ts:2:1)', APP_PATH)).toBe(
      'at x (<path>)',
    );
  });

  it("removes pi's dash-encoded session folders", () => {
    expect(scrubErrorText('session --Users-ann-work-acme-- not found', APP_PATH)).toBe(
      'session <path> not found',
    );
  });

  it('removes URLs, which name hosts and keys', () => {
    expect(
      scrubErrorText('fetch failed: https://llm.internal.acme.com/v1?key=sk-123 (503)', APP_PATH),
    ).toBe('fetch failed: <url> (503)');
    expect(scrubErrorText('open file:///Users/ann/a.txt', APP_PATH)).toBe('open <url>');
  });

  it('leaves text without paths alone', () => {
    expect(scrubErrorText('Expected 3 items, got 1/2 of them', APP_PATH)).toBe(
      'Expected 3 items, got 1/2 of them',
    );
  });
});
