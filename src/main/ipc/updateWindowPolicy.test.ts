import { describe, expect, it } from 'vitest';
import type { UpdateStatus } from '../../shared/ipcContract';
import { updateWindowAction } from './updateWindowPolicy';

/**
 * The window's lifetime is the one part of the update feature a dev run cannot
 * reach: opening the real window only happens in a packaged app. Keeping the
 * decision pure is what makes it testable here instead of by shipping a version.
 */

const MANUAL = { manualCheck: true };
const BACKGROUND = { manualCheck: false };

describe('updateWindowAction', () => {
  it('holds "up to date" briefly, however the check was started', () => {
    // A background check can find the window open too: the user opened it while
    // that check was running, and without this it would count down forever.
    const status: UpdateStatus = { phase: 'up_to_date' };

    expect(updateWindowAction(status, MANUAL)).toBe('schedule-close');
    expect(updateWindowAction(status, BACKGROUND)).toBe('schedule-close');
  });

  it('closes on a failed check the user asked for', () => {
    expect(updateWindowAction({ phase: 'error', message: 'offline' }, MANUAL)).toBe('close');
  });

  it('keeps the window on a failed background check', () => {
    // Nothing toasts a background failure, so closing would swallow the reason.
    expect(updateWindowAction({ phase: 'error', message: 'offline' }, BACKGROUND)).toBe('keep');
  });

  it('keeps a new check from being taken away by the answer before it', () => {
    // This is the case that used to flash: "up to date" armed the countdown,
    // the user checked again, and the old timer closed the asking window.
    expect(updateWindowAction({ phase: 'checking' }, MANUAL)).toBe('keep');
    expect(updateWindowAction({ phase: 'checking' }, BACKGROUND)).toBe('keep');
  });

  it('keeps every status that has its own buttons on it', () => {
    const withButtons: UpdateStatus[] = [
      {
        phase: 'downloading',
        version: '0.4.23',
        percent: 40,
        transferredBytes: 40,
        totalBytes: 100,
      },
      { phase: 'downloaded', version: '0.4.23' },
      { phase: 'installing', version: '0.4.23' },
    ];

    for (const status of withButtons) {
      expect(updateWindowAction(status, MANUAL)).toBe('keep');
      expect(updateWindowAction(status, BACKGROUND)).toBe('keep');
    }
  });

  it('never counts down a status that is not "up to date"', () => {
    const others: UpdateStatus[] = [
      { phase: 'unsupported' },
      { phase: 'idle' },
      { phase: 'checking' },
      { phase: 'downloaded', version: '0.4.23' },
      { phase: 'error', message: 'offline' },
    ];

    for (const status of others) {
      expect(updateWindowAction(status, MANUAL)).not.toBe('schedule-close');
    }
  });
});
