// @vitest-environment jsdom
/**
 * What a settings commit reaches beyond the store.
 *
 * The appearance pipeline is the expensive half — it derives ~45 tokens, writes
 * them to `<html>` and notifies every code block and terminal — so it must only
 * run for an appearance change. A chat setting used to run it too, which is what
 * this pins.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeAppearance } from '../appearance/applyAppearance';
import { installSystemAppearance } from '../testing/jsdomSetup';
import { flushPigiSettingsWrites, useSettingsStore } from './settingsStore';

beforeEach(() => {
  // jsdom has no matchMedia; the appearance pipeline reads it on every apply.
  installSystemAppearance({ dark: false });
});

afterEach(() => {
  flushPigiSettingsWrites();
});

describe('settings commit', () => {
  it('leaves the appearance alone when only a chat setting changed', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppearance(listener);

    useSettingsStore.getState().setToolBlockViewMode('default');

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('applies the appearance when an appearance setting changed', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppearance(listener);

    useSettingsStore.getState().setMode('dark');

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
