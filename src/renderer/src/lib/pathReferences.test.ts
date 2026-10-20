import { describe, expect, it } from 'vitest';
import { findPathTokenAtEnd } from './pathReferences';

describe('findPathTokenAtEnd', () => {
  it('finds the token that ends at the cursor', () => {
    expect(findPathTokenAtEnd('src/renderer')).toEqual({
      token: 'src/renderer',
      startOffset: 0,
    });
  });

  it('starts after whitespace', () => {
    expect(findPathTokenAtEnd('look at src/renderer')).toEqual({
      token: 'src/renderer',
      startOffset: 8,
    });
  });

  it('requires a slash', () => {
    expect(findPathTokenAtEnd('src')).toBeNull();
  });

  it('ignores URLs', () => {
    expect(findPathTokenAtEnd('https://example.com/a')).toBeNull();
    expect(findPathTokenAtEnd('see //host/share')).toBeNull();
  });

  it('leaves @ and # references to their own pickers', () => {
    expect(findPathTokenAtEnd('@src/renderer')).toBeNull();
    expect(findPathTokenAtEnd('#project/src')).toBeNull();
  });

  it('allows an absolute path after whitespace', () => {
    expect(findPathTokenAtEnd('open /Users/me')).toEqual({
      token: '/Users/me',
      startOffset: 5,
    });
  });
});
