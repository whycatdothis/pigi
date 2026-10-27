import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The type scale is named in designTokens.css (caption, ui, body, code, ...).
// tailwind-merge only knows Tailwind's own sizes, so without this a variant's
// `text-caption` and a caller's `text-sm` both survive `cn()` and the stylesheet
// order picks the winner instead of the last class the caller wrote.
const mergeClassName = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['caption', 'ui', 'body', 'code', 'code-compact', '2xs', '3xs'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return mergeClassName(clsx(inputs));
}

/**
 * Format a date string as a relative time (e.g. "2h", "3d", "now").
 */
export function formatRelativeTime(value: string, now: number): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  const elapsedSeconds = Math.max(0, Math.round((now - timestamp) / 1000));
  const ranges: Array<[string, number]> = [
    ['y', 60 * 60 * 24 * 365],
    ['mo', 60 * 60 * 24 * 30],
    ['w', 60 * 60 * 24 * 7],
    ['d', 60 * 60 * 24],
    ['h', 60 * 60],
    ['m', 60],
  ];

  for (const [suffix, seconds] of ranges) {
    if (elapsedSeconds >= seconds) {
      return `${Math.floor(elapsedSeconds / seconds)}${suffix}`;
    }
  }

  return 'now';
}
