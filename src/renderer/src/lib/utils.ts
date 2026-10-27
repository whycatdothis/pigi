import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The type scale is named in designTokens.css (caption, ui, body, code, ...).
// tailwind-merge only knows Tailwind's own sizes, so without this a variant's
// `text-caption` and a caller's `text-sm` both survive `cn()` and the stylesheet
// order picks the winner instead of the last class the caller wrote.
//
// Radius is named by role in semanticTokens.css for the same reason: without the
// names here, a primitive's `rounded-control` and a caller's `rounded-surface`
// would both survive and the cascade, not the caller, would decide. Both entries
// replace the Tailwind steps the app used to write.
const RADIUS_ROLES = [
  'inline',
  'chip',
  'control',
  'control-sm',
  'surface',
  'surface-sm',
  'surface-lg',
  'surface-xl',
  'container',
  'full',
];

const mergeClassName = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['caption', 'ui', 'body', 'code', 'code-compact', '2xs', '3xs'] }],
      rounded: [{ rounded: RADIUS_ROLES }],
      'rounded-s': [{ 'rounded-s': RADIUS_ROLES }],
      'rounded-e': [{ 'rounded-e': RADIUS_ROLES }],
      'rounded-t': [{ 'rounded-t': RADIUS_ROLES }],
      'rounded-r': [{ 'rounded-r': RADIUS_ROLES }],
      'rounded-b': [{ 'rounded-b': RADIUS_ROLES }],
      'rounded-l': [{ 'rounded-l': RADIUS_ROLES }],
      'rounded-ss': [{ 'rounded-ss': RADIUS_ROLES }],
      'rounded-se': [{ 'rounded-se': RADIUS_ROLES }],
      'rounded-ee': [{ 'rounded-ee': RADIUS_ROLES }],
      'rounded-es': [{ 'rounded-es': RADIUS_ROLES }],
      'rounded-tl': [{ 'rounded-tl': RADIUS_ROLES }],
      'rounded-tr': [{ 'rounded-tr': RADIUS_ROLES }],
      'rounded-br': [{ 'rounded-br': RADIUS_ROLES }],
      'rounded-bl': [{ 'rounded-bl': RADIUS_ROLES }],
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
