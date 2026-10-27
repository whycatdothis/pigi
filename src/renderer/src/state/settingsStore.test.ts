// @vitest-environment jsdom
/**
 * What a settings commit reaches beyond the store.
 *
 * The appearance pipeline is expensive — it derives ~45 tokens, writes them to
 * `<html>` and notifies every code block and terminal — so it must only run for
 * an appearance change.
 *
 * The rest of the contract is the single-owner one: a commit applies locally for
 * instant feedback and sends only the slice it changed; main merges that slice
 * onto the file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeAppearance } from '../appearance/applyAppearance';
import { installSystemAppearance } from '../testing/jsdomSetup';
import { installPigiSettingsBridge, type PigiSettingsBridge } from '../testing/pigiSettingsBridge';
import { useSettingsStore } from './settingsStore';
import { DEFAULT_PIGI_SETTINGS } from '../../../shared/pigiSettings';

let bridge: PigiSettingsBridge;

beforeEach(() => {
  // jsdom has no matchMedia; the appearance pipeline reads it on every apply.
  installSystemAppearance({ dark: false });
  bridge = installPigiSettingsBridge();
  useSettingsStore.setState({ ...DEFAULT_PIGI_SETTINGS });
});

afterEach(() => {
  vi.restoreAllMocks();
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

  it('sends only the slice it changed, and applies it locally first', () => {
    useSettingsStore.getState().setToolBlockViewMode('minimal');

    expect(bridge.changes).toEqual([
      { chat: { ...DEFAULT_PIGI_SETTINGS.chat, toolBlockViewMode: 'minimal' } },
    ]);
    // Applied before the round trip, so a dragged slider never waits for main.
    expect(useSettingsStore.getState().chat.toolBlockViewMode).toBe('minimal');
    expect(bridge.current().chat.toolBlockViewMode).toBe('minimal');
  });

  it('sends the appearance slice and nothing else for a theme change', () => {
    useSettingsStore.getState().setMode('light');

    expect(bridge.changes).toHaveLength(1);
    expect(bridge.changes[0].chat).toBeUndefined();
    expect(bridge.changes[0].appearance?.mode).toBe('light');
  });
});
