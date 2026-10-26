// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { applyAppearance } from './applyAppearance';
import { DEFAULT_APPEARANCE } from '../../../shared/appearance';
import { installSystemAppearance } from '../testing/jsdomSetup';

function transitionBlockers(): HTMLStyleElement[] {
  return [...document.head.querySelectorAll('style')].filter((style) =>
    style.textContent.includes('transition:none'),
  );
}

beforeEach(() => {
  installSystemAppearance({ dark: false });
});

test('turns transitions off while a theme change paints, then back on', () => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  try {
    applyAppearance({ ...DEFAULT_APPEARANCE, mode: 'light' });
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();

    applyAppearance({ ...DEFAULT_APPEARANCE, mode: 'dark' });
    expect(transitionBlockers()).toHaveLength(1);
    // A second change before the restore keeps the one blocker.
    applyAppearance({ ...DEFAULT_APPEARANCE, mode: 'light' });
    expect(transitionBlockers()).toHaveLength(1);

    vi.advanceTimersToNextFrame();
    expect(transitionBlockers()).toHaveLength(1);
    vi.advanceTimersToNextFrame();
    expect(transitionBlockers()).toHaveLength(0);

    // Same colours again (a chat-only settings commit): nothing to suspend.
    applyAppearance({ ...DEFAULT_APPEARANCE, mode: 'light' });
    expect(transitionBlockers()).toHaveLength(0);
  } finally {
    vi.useRealTimers();
  }
});
