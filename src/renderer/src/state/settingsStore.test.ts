// @vitest-environment jsdom
/**
 * What a settings commit reaches beyond the store.
 *
 * The appearance pipeline is expensive — it derives ~45 tokens, writes them to
 * `<html>` and notifies every code block and terminal — so it must only run for
 * an appearance change and only when the look actually changed.
 *
 * The rest of the contract is the single-owner one: a commit applies locally for
 * instant feedback, sends only the slice it changed, and adopts the owner's
 * snapshot; a snapshot with an older revision (a reply that lost the race with
 * another window's broadcast) is dropped.
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

/** A snapshot the owner would produce for the current look at a revision. */
function snapshotAt(revision: number): typeof DEFAULT_PIGI_SETTINGS {
  const state = useSettingsStore.getState();
  return {
    version: state.version,
    revision,
    appearance: state.appearance,
    chat: state.chat,
  };
}

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

  it('sends only the slice it changed, and adopts the owner snapshot', async () => {
    useSettingsStore.getState().setToolBlockViewMode('minimal');

    expect(bridge.changes).toEqual([
      { chat: { ...DEFAULT_PIGI_SETTINGS.chat, toolBlockViewMode: 'minimal' } },
    ]);
    // The local value was applied immediately, before the reply.
    expect(useSettingsStore.getState().chat.toolBlockViewMode).toBe('minimal');

    await Promise.resolve();
    // The store took the snapshot the owner returned, revision included.
    expect(useSettingsStore.getState().revision).toBe(bridge.current().revision);
    expect(useSettingsStore.getState().chat).toEqual(bridge.current().chat);
  });

  it('drops a snapshot with an older revision', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppearance(listener);

    // The store already holds a newer copy (as if it adopted the other
    // window's broadcast); this reply lost that race.
    useSettingsStore.setState({ revision: 4 });
    bridge.broadcast(snapshotAt(2));
    expect(useSettingsStore.getState().revision).toBe(4);
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('adopts a newer broadcast from the other window, and re-themes for it', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppearance(listener);

    const dark = {
      ...snapshotAt(9),
      appearance: { ...useSettingsStore.getState().appearance, mode: 'dark' as const },
    };
    bridge.broadcast(dark);

    expect(useSettingsStore.getState().revision).toBe(9);
    expect(useSettingsStore.getState().appearance.mode).toBe('dark');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('adopts a same-revision snapshot without re-theming when the look matches', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppearance(listener);

    // The reply to this window's own change: same appearance, one revision on.
    bridge.broadcast(snapshotAt(5));

    expect(useSettingsStore.getState().revision).toBe(5);
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });
});
