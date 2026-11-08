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

  it('replaces paths with spaces, relative and Windows paths', () => {
    expect(scrubErrorText("open '/Users/ann/My Projects/acme secret/.env'", APP_PATH)).toBe(
      "open '<path>'",
    );
    expect(scrubErrorText('scandir /Users/ann/My Projects/acme', APP_PATH)).toBe('scandir <path>');
    expect(scrubErrorText('cwd:/Users/ann/acme', APP_PATH)).toBe('cwd:<path>');
    expect(scrubErrorText('Cannot read src/secret-project/index.ts', APP_PATH)).toBe(
      'Cannot read <path>',
    );
    expect(scrubErrorText('Cannot read ./acme/index.ts, ../acme/a.ts', APP_PATH)).toBe(
      'Cannot read <path>, <path>',
    );
    expect(scrubErrorText('open C:\\Users\\ann\\acme\\.env', APP_PATH)).toBe('open <path>');
    expect(scrubErrorText('open \\\\server\\share\\acme', APP_PATH)).toBe('open <path>');
    expect(scrubErrorText('dir: --Users-ann-My Projects-acme-- gone', APP_PATH)).toBe(
      'dir: <path> gone',
    );
  });

  it('removes hosts, addresses, keys and model names', () => {
    expect(scrubErrorText('getaddrinfo ENOTFOUND llm.internal.acme.com', APP_PATH)).toBe(
      'getaddrinfo ENOTFOUND <host>',
    );
    expect(scrubErrorText('Invalid key sk-ant-api03-Xk2mP9qLr7Tz', APP_PATH)).toBe(
      'Invalid key <token>',
    );
    expect(scrubErrorText('user ann@acme.com denied', APP_PATH)).toBe('user <email> denied');
    expect(scrubErrorText('clone git@github.com:acme/secret.git', APP_PATH)).toBe('clone <path>');
    expect(scrubErrorText('model not found: acme-llm/llama-70b', APP_PATH)).toBe(
      'model not found: <path>',
    );
  });

  it('leaves text without names alone', () => {
    expect(scrubErrorText("Cannot read properties of undefined (reading 'id')", APP_PATH)).toBe(
      "Cannot read properties of undefined (reading 'id')",
    );
    expect(scrubErrorText('Unknown flag --foo; use --bar', APP_PATH)).toBe(
      'Unknown flag --foo; use --bar',
    );
  });
});
