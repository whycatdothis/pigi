/**
 * The renderer's boundary, asserted rather than remembered. Each of these has
 * been relaxed by hand somewhere at least once ("temporarily", to fix a bug),
 * and nothing caught it: the window opened, the app worked, and the sandbox was
 * gone. This file is what catches that now.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RENDERER_SECURITY_PREFERENCES } from './rendererSecurityPreferences';

const INDEX_HTML = new URL('../../renderer/index.html', import.meta.url);

function policy(): string {
  const html = readFileSync(INDEX_HTML, 'utf8');
  const match = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

describe('renderer web preferences', () => {
  it('keeps the renderer sandboxed, cross-origin isolated and without Node', () => {
    expect(RENDERER_SECURITY_PREFERENCES.sandbox).toBe(true);
    expect(RENDERER_SECURITY_PREFERENCES.contextIsolation).toBe(true);
    expect(RENDERER_SECURITY_PREFERENCES.nodeIntegration).toBe(false);
    expect(RENDERER_SECURITY_PREFERENCES.nodeIntegrationInSubFrames).toBe(false);
    expect(RENDERER_SECURITY_PREFERENCES.webSecurity).toBe(true);
    expect(RENDERER_SECURITY_PREFERENCES.allowRunningInsecureContent).toBe(false);
  });
});

describe('content security policy', () => {
  it('loads scripts only from the app itself', () => {
    const directives = policy();
    expect(directives).toContain("default-src 'self'");
    expect(directives).toContain("script-src 'self' 'wasm-unsafe-eval'");
    // `unsafe-eval` (without the wasm prefix) is the one that turns a markdown
    // bug into code execution.
    expect(directives).not.toContain("'unsafe-eval'");
    expect(directives).not.toMatch(/script-src[^;]*\*/);
  });

  it('cannot be navigated away from, embedded, or given plugins', () => {
    const directives = policy();
    expect(directives).toContain("object-src 'none'");
    expect(directives).toContain("base-uri 'none'");
    expect(directives).toContain("frame-src 'none'");
    expect(directives).toContain("form-action 'none'");
  });

  it('keeps remote images out and the two app schemes in', () => {
    const directives = policy();
    expect(directives).toMatch(/img-src 'self' data: package-image: local-file:/);
    expect(directives).not.toMatch(/img-src[^;]*\bhttps:/);
  });
});
