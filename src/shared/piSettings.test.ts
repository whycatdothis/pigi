import { describe, expect, it } from 'vitest';
import {
  findPiSettingField,
  isPiSettingValueValid,
  setPiSettingValue,
  type PiSettingValue,
} from './piSettings';

function valid(fieldId: string, value: unknown): boolean {
  const field = findPiSettingField(fieldId);
  if (!field) {
    throw new Error(`unknown field ${String(fieldId)}`);
  }
  return isPiSettingValueValid(field, value as PiSettingValue);
}

describe('isPiSettingValueValid', () => {
  it('accepts a value inside the declared range', () => {
    expect(valid('retry.maxRetries', 3)).toBe(true);
    expect(valid('retry.maxRetries', 0)).toBe(true);
    expect(valid('httpIdleTimeoutMs', 300_000)).toBe(true);
  });

  it('refuses a number outside the declared range', () => {
    // The registry is the exposure boundary: a negative retry count or a
    // timeout measured in years would be written straight to pi's file.
    expect(valid('retry.maxRetries', -1)).toBe(false);
    expect(valid('retry.maxRetries', 1_000)).toBe(false);
    expect(valid('httpIdleTimeoutMs', 1e12)).toBe(false);
    expect(valid('httpIdleTimeoutMs', Number.NaN)).toBe(false);
  });

  it('refuses an over-long resource list or entry', () => {
    expect(valid('extensions', ['a', 'b'])).toBe(true);
    expect(
      valid(
        'extensions',
        Array.from({ length: 1_001 }, () => 'x'),
      ),
    ).toBe(false);
    expect(valid('extensions', ['x'.repeat(4_097)])).toBe(false);
  });

  it('still refuses a value of the wrong type', () => {
    expect(valid('retry.maxRetries', '3')).toBe(false);
    expect(valid('retry.enabled', 1)).toBe(false);
    expect(valid('transport', 'carrier-pigeon')).toBe(false);
  });
});

describe('setPiSettingValue', () => {
  it('writes a dotted field into the nested object', () => {
    const target: Record<string, unknown> = {};

    setPiSettingValue(target, 'compaction.reserveTokens', 16384);

    expect(target).toEqual({ compaction: { reserveTokens: 16384 } });
  });

  it('keeps the siblings of a nested write', () => {
    const target: Record<string, unknown> = {
      compaction: { reserveTokens: 1, keepRecentTokens: 2 },
      theme: 'dark',
    };

    setPiSettingValue(target, 'compaction.reserveTokens', 9);

    expect(target).toEqual({
      compaction: { reserveTokens: 9, keepRecentTokens: 2 },
      theme: 'dark',
    });
  });

  it('clears a field and drops its parent once the parent is empty', () => {
    const target: Record<string, unknown> = { compaction: { reserveTokens: 16384 } };

    setPiSettingValue(target, 'compaction.reserveTokens', undefined);

    expect(target).toEqual({});
  });

  it('clears one field without dropping a sibling', () => {
    const target: Record<string, unknown> = {
      compaction: { reserveTokens: 16384, keepRecentTokens: 20000 },
    };

    setPiSettingValue(target, 'compaction.keepRecentTokens', undefined);

    expect(target).toEqual({ compaction: { reserveTokens: 16384 } });
  });

  it('leaves a non-object parent alone rather than losing what it held', () => {
    // A hand-edited file can hold a scalar where the registry expects an object.
    const target: Record<string, unknown> = { compaction: 'off' };

    setPiSettingValue(target, 'compaction.reserveTokens', 100);

    expect(target).toEqual({ compaction: { reserveTokens: 100 } });
  });

  it('does not throw when clearing a field that was never set', () => {
    const target: Record<string, unknown> = {};

    expect(() => setPiSettingValue(target, 'compaction.reserveTokens', undefined)).not.toThrow();
    expect(target).toEqual({});
  });
});
