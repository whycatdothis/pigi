import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {}, dialog: {}, ipcMain: {} }));
vi.mock('../windows/createMainWindow', () => ({ getMainWindow: () => null }));
vi.mock('../remoteControl/remoteControlServer', () => ({
  launcherDirectory: () =>
    '/Applications/pigi.app/Contents/Resources/app.asar.unpacked/resources/bin',
}));

import { installStatusOf } from './cliInstall';

const root = mkdtempSync(join(tmpdir(), 'pigi-cli-install-'));
const launcherIn = (...parts: string[]): string =>
  join(root, ...parts, 'Contents', 'Resources', 'app.asar.unpacked', 'resources', 'bin', 'pigi');

const LAUNCHER = launcherIn('pigi.app');
/** Where the link still points after the app was moved. */
const OLD_LAUNCHER = launcherIn('Elsewhere', 'pigi.app');

mkdirSync(dirname(LAUNCHER), { recursive: true });
writeFileSync(LAUNCHER, '#!/bin/sh\n');

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('the pigi command on PATH', () => {
  it('is not installed when nothing is at the path', () => {
    expect(installStatusOf({ kind: 'absent' }, LAUNCHER)).toBe('not-installed');
  });

  it('is installed when the link points at this bundle', () => {
    expect(installStatusOf({ kind: 'link', target: LAUNCHER }, LAUNCHER)).toBe('installed');
  });

  it('is broken when the link points at a bundle that moved', () => {
    // Still this app's link, so replacing it asks nothing; the path is just gone.
    expect(installStatusOf({ kind: 'link', target: OLD_LAUNCHER }, LAUNCHER)).toBe('broken');
  });

  it('leaves another program’s file alone', () => {
    expect(installStatusOf({ kind: 'other' }, LAUNCHER)).toBe('conflict');
    expect(installStatusOf({ kind: 'link', target: '/opt/homebrew/bin/pigi' }, LAUNCHER)).toBe(
      'conflict',
    );
  });
});
