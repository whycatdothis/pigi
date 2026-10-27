import { EventEmitter } from 'events';
import type { WebContents } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guardWindowNavigation } from './windowNavigation';

const openExternal = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({ shell: { openExternal } }));

const RENDERER_INDEX = '/app/out/renderer/index.html';
const APP_URL = 'file:///app/out/renderer/index.html';

function createWebContents(): WebContents {
  // Stand-in for Electron's WebContents: the guard only registers listeners on
  // it, and there is no WebContents outside a running Electron process. The
  // double cast is the seam between a real Electron object and this stub.
  return new EventEmitter() as unknown as WebContents;
}

function navigate(webContents: WebContents, url: string): ReturnType<typeof vi.fn> {
  const preventDefault = vi.fn();
  webContents.emit('will-navigate', { preventDefault }, url);
  return preventDefault;
}

describe('guardWindowNavigation', () => {
  beforeEach(() => {
    openExternal.mockClear();
    vi.stubEnv('ELECTRON_RENDERER_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('denies a link that would replace the app, and opens it in the browser', () => {
    const webContents = createWebContents();
    guardWindowNavigation(webContents, RENDERER_INDEX);

    expect(navigate(webContents, 'https://example.com/docs').mock.calls.length).toBe(1);
    expect(openExternal).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('lets the app load itself', () => {
    const webContents = createWebContents();
    guardWindowNavigation(webContents, RENDERER_INDEX);

    expect(navigate(webContents, APP_URL).mock.calls.length).toBe(0);
    expect(navigate(webContents, `${APP_URL}#/settings`).mock.calls.length).toBe(0);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('denies a local file and any non-web scheme without handing it to the shell', () => {
    const webContents = createWebContents();
    guardWindowNavigation(webContents, RENDERER_INDEX);

    expect(navigate(webContents, 'file:///etc/passwd').mock.calls.length).toBe(1);
    expect(navigate(webContents, 'javascript:alert(1)').mock.calls.length).toBe(1);
    expect(navigate(webContents, 'smb://host/share').mock.calls.length).toBe(1);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('guards redirects as well as navigations', () => {
    const webContents = createWebContents();
    guardWindowNavigation(webContents, RENDERER_INDEX);

    const preventDefault = vi.fn();
    webContents.emit('will-redirect', { preventDefault }, 'https://example.com/');
    expect(preventDefault).toHaveBeenCalled();
  });

  it('treats the dev server origin as the app and everything else as outside it', () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/');
    const webContents = createWebContents();
    guardWindowNavigation(webContents, RENDERER_INDEX);

    expect(navigate(webContents, 'http://localhost:5173/index.html').mock.calls.length).toBe(0);
    expect(navigate(webContents, 'http://localhost:5173/#/settings').mock.calls.length).toBe(0);
    expect(navigate(webContents, 'http://localhost:6006/').mock.calls.length).toBe(1);
  });
});
