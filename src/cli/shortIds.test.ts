import { describe, expect, it } from 'vitest';
import { shortIds } from './shortIds';

describe('shortIds', () => {
  it('keeps the creation time, which sessions made the same minute share in shorter prefixes', () => {
    expect(shortIds(['01a1b9cc-6e5c-7b9e-ae65', '01a1b9cc-7f00-7000-8000'])).toEqual([
      '01a1b9cc-6e5c',
      '01a1b9cc-7f00',
    ]);
  });

  it('lengthens a prefix until no other id has it', () => {
    expect(shortIds(['01a1b9cc-6e5c-7b9e', '01a1b9cc-6e5c-7c00', 'ffff0000-0000-0000'])).toEqual([
      '01a1b9cc-6e5c-7b',
      '01a1b9cc-6e5c-7c',
      'ffff0000-0000',
    ]);
  });
});
