import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  // The type scale names (designTokens.css) are not Tailwind's own sizes; the
  // merge config in utils.ts has to know them, or a caller can never override a
  // component variant's font size.
  it('resolves a named type-scale size against a Tailwind one', () => {
    expect(cn('text-sm', 'text-caption')).toBe('text-caption');
    expect(cn('text-caption', 'text-sm')).toBe('text-sm');
  });

  it('keeps a text colour next to a size', () => {
    expect(cn('text-muted-foreground', 'text-body', 'text-sm')).toBe(
      'text-muted-foreground text-sm',
    );
  });
});
