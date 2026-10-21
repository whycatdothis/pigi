import { describe, expect, it } from 'vitest';
import { fileIconUrl } from './fileIcons';

describe('fileIconUrl', () => {
  it('prefers an exact file name over the extension', () => {
    expect(fileIconUrl('website/package.json')).toMatch(/\/nodejs\.svg/);
  });

  it('matches the longest extension first', () => {
    expect(fileIconUrl('src/App.tsx')).toMatch(/\/react_ts\.svg/);
    expect(fileIconUrl('src/a.test.ts')).toMatch(/\/test-ts\.svg/);
  });

  it('falls back to the generic file icon', () => {
    expect(fileIconUrl('notes.unknownext')).toMatch(/\/file\.svg/);
  });
});
