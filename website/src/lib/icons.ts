/**
 * The icon set.
 *
 * Every glyph is a Tabler SVG, imported as source at build time and inlined
 * into the page. That is deliberately the same set the app draws from
 * (`@tabler/icons-react`), so the UI recreated on this page carries the app's
 * own glyphs rather than lookalikes — and it costs no client-side JavaScript and
 * no icon-font request.
 *
 * A glyph is only listed here if something on the site renders it. Astro has to
 * see a static import path to bundle the file, so the map is written out longhand.
 */
import arrowFork from '@tabler/icons/outline/arrow-fork.svg?raw';
import arrowRight from '@tabler/icons/outline/arrow-right.svg?raw';
import arrowUp from '@tabler/icons/outline/arrow-up.svg?raw';
import binaryTree2 from '@tabler/icons/outline/binary-tree-2.svg?raw';
import bolt from '@tabler/icons/outline/bolt.svg?raw';
import brain from '@tabler/icons/outline/brain.svg?raw';
import brandGithub from '@tabler/icons/outline/brand-github.svg?raw';
import check from '@tabler/icons/outline/check.svg?raw';
import chevronDown from '@tabler/icons/outline/chevron-down.svg?raw';
import chevronRight from '@tabler/icons/outline/chevron-right.svg?raw';
import chevronUp from '@tabler/icons/outline/chevron-up.svg?raw';
import command from '@tabler/icons/outline/command.svg?raw';
import copy from '@tabler/icons/outline/copy.svg?raw';
import download from '@tabler/icons/outline/download.svg?raw';
import externalLink from '@tabler/icons/outline/external-link.svg?raw';
import filter2 from '@tabler/icons/outline/filter-2.svg?raw';
import folder from '@tabler/icons/outline/folder.svg?raw';
import folderPlus from '@tabler/icons/outline/folder-plus.svg?raw';
import gitBranch from '@tabler/icons/outline/git-branch.svg?raw';
import gitFork from '@tabler/icons/outline/git-fork.svg?raw';
import keyboard from '@tabler/icons/outline/keyboard.svg?raw';
import listDetails from '@tabler/icons/outline/list-details.svg?raw';
import loader2 from '@tabler/icons/outline/loader-2.svg?raw';
import lock from '@tabler/icons/outline/lock.svg?raw';
import message from '@tabler/icons/outline/message.svg?raw';
import minus from '@tabler/icons/outline/minus.svg?raw';
import moon from '@tabler/icons/outline/moon.svg?raw';
import notebook from '@tabler/icons/outline/notebook.svg?raw';
import plus from '@tabler/icons/outline/plus.svg?raw';
import search from '@tabler/icons/outline/search.svg?raw';
import settings from '@tabler/icons/outline/settings.svg?raw';
import sparkles from '@tabler/icons/outline/sparkles.svg?raw';
import square from '@tabler/icons/outline/square.svg?raw';
import sun from '@tabler/icons/outline/sun.svg?raw';
import terminal2 from '@tabler/icons/outline/terminal-2.svg?raw';
import user from '@tabler/icons/outline/user.svg?raw';
import x from '@tabler/icons/outline/x.svg?raw';

export const ICONS = {
  'arrow-fork': arrowFork,
  'arrow-right': arrowRight,
  'arrow-up': arrowUp,
  'binary-tree-2': binaryTree2,
  bolt,
  brain,
  'brand-github': brandGithub,
  check,
  'chevron-down': chevronDown,
  'chevron-right': chevronRight,
  'chevron-up': chevronUp,
  command,
  copy,
  download,
  'external-link': externalLink,
  'filter-2': filter2,
  folder,
  'folder-plus': folderPlus,
  'git-branch': gitBranch,
  'git-fork': gitFork,
  keyboard,
  'list-details': listDetails,
  'loader-2': loader2,
  lock,
  message,
  minus,
  moon,
  notebook,
  plus,
  search,
  settings,
  sparkles,
  square,
  sun,
  'terminal-2': terminal2,
  user,
  x,
} as const;

export type IconName = keyof typeof ICONS;

/** Everything between the `<svg>` tags of a source file. */
const SVG_BODY = /<svg[^>]*>([\s\S]*)<\/svg>/;

export interface IconOptions {
  /** Rendered box, in pixels. Tabler draws on a 24-unit grid at any size. */
  size?: number;
  /** Overrides the 1.5 the app dials Tabler's 2px stroke down to. */
  stroke?: number;
  /** Extra classes for the `<svg>` element. */
  className?: string;
  /** Set when the icon is the only content of a control with no label of its own. */
  label?: string;
}

/**
 * An icon as an HTML string.
 *
 * The wrapper is written here rather than reused from the source file because
 * Tabler bakes `width="24" height="24" stroke-width="2"` and its own classes into
 * every one of them, and none of those are what this page wants.
 */
export function renderIcon(name: IconName, options: IconOptions = {}): string {
  const { size = 16, stroke = 1.5, className = '', label } = options;
  const body = ICONS[name].match(SVG_BODY)?.[1].trim() ?? '';
  const accessibility = label
    ? `role="img" aria-label="${label}"`
    : 'aria-hidden="true" focusable="false"';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"`,
    ` fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round"`,
    ` stroke-linejoin="round" ${accessibility}`,
    className ? ` class="tabler-icon ${className}"` : ' class="tabler-icon"',
    `>${body}</svg>`,
  ].join('');
}
