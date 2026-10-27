import { describe, expect, it } from 'vitest';
import { findPiSettingField, isPiSettingValueValid, type PiSettingValue } from './piSettings';

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
