import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { guardWindowNavigation } from './windowNavigation';

const openExternal = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({ shell: { openExternal } }));

const RENDERER_INDEX = '/app/out/renderer/index.html';
const APP_URL = 'file:///app/out/renderer/index.html';

interface WebContentsStub extends EventEmitter {
  setWindowOpenHandler: (handler: (details: { url: string }) => { action: string }) => void;
  openWindow: (url: string) => { action: string } | undefined;
}

function createWebContents(): WebContentsStub {
  // Stand-in for Electron's WebContents: the guard only registers listeners and
  // a window-open handler on it, and there is no WebContents outside a running
  // Electron process. The cast is the seam between Electron and this stub.
  const stub = new EventEmitter() as WebContentsStub;
  let handler: ((details: { url: string }) => { action: string }) | undefined;
  stub.setWindowOpenHandler = (next) => {
    handler = next;
  };
  stub.openWindow = (url) => handler?.({ url });
  return stub;
}

function guard(stub: WebContentsStub): WebContentsStub {
  // The double implements the two members the guard touches; Electron's type is
  // the seam between them.
  guardWindowNavigation(stub as unknown as WebContents, RENDERER_INDEX);
  return stub;
}

function navigate(webContents: WebContentsStub, url: string): ReturnType<typeof vi.fn> {
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
    const webContents = guard(createWebContents());

    expect(navigate(webContents, 'https://example.com/docs').mock.calls.length).toBe(1);
    expect(openExternal).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('lets the app load itself', () => {
    const webContents = guard(createWebContents());

    expect(navigate(webContents, APP_URL).mock.calls.length).toBe(0);
    expect(navigate(webContents, `${APP_URL}#/settings`).mock.calls.length).toBe(0);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('denies a local file and any non-web scheme without handing it to the shell', () => {
    const webContents = guard(createWebContents());

    expect(navigate(webContents, 'file:///etc/passwd').mock.calls.length).toBe(1);
    expect(navigate(webContents, 'javascript:alert(1)').mock.calls.length).toBe(1);
    expect(navigate(webContents, 'smb://host/share').mock.calls.length).toBe(1);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('guards redirects as well as navigations', () => {
    const webContents = guard(createWebContents());

    const preventDefault = vi.fn();
    webContents.emit('will-redirect', { preventDefault }, 'https://example.com/');
    expect(preventDefault).toHaveBeenCalled();
  });

  it('denies window.open and sends a web link to the browser', () => {
    const webContents = guard(createWebContents());

    expect(webContents.openWindow('https://example.com/popup')).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledWith('https://example.com/popup');

    openExternal.mockClear();
    expect(webContents.openWindow('file:///etc/passwd')).toEqual({ action: 'deny' });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('treats the dev server origin as the app and everything else as outside it', () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/');
    const webContents = guard(createWebContents());

    expect(navigate(webContents, 'http://localhost:5173/index.html').mock.calls.length).toBe(0);
    expect(navigate(webContents, 'http://localhost:5173/#/settings').mock.calls.length).toBe(0);
    expect(navigate(webContents, 'http://localhost:6006/').mock.calls.length).toBe(1);
  });
});
