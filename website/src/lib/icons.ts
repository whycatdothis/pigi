// Imports are written out longhand because the bundler needs static paths.
// lucide-static stays on the version the app's lucide-react uses.
import arrowsMinimize from '@tabler/icons/outline/arrows-minimize.svg?raw';
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
import dots from '@tabler/icons/outline/dots.svg?raw';
import copy from '@tabler/icons/outline/copy.svg?raw';
import download from '@tabler/icons/outline/download.svg?raw';
import externalLink from '@tabler/icons/outline/external-link.svg?raw';
import filter2 from '@tabler/icons/outline/filter-2.svg?raw';
import folder from '@tabler/icons/outline/folder.svg?raw';
import folderPlus from '@tabler/icons/outline/folder-plus.svg?raw';
import gitBranch from '@tabler/icons/outline/git-branch.svg?raw';
import gitFork from '@tabler/icons/outline/git-fork.svg?raw';
import history from '@tabler/icons/outline/history.svg?raw';
import keyboard from '@tabler/icons/outline/keyboard.svg?raw';
import listDetails from '@tabler/icons/outline/list-details.svg?raw';
import loader2 from '@tabler/icons/outline/loader-2.svg?raw';
import lock from '@tabler/icons/outline/lock.svg?raw';
import message from '@tabler/icons/outline/message.svg?raw';
import minus from '@tabler/icons/outline/minus.svg?raw';
import moon from '@tabler/icons/outline/moon.svg?raw';
import notebook from '@tabler/icons/outline/notebook.svg?raw';
import plus from '@tabler/icons/outline/plus.svg?raw';
import questionMark from '@tabler/icons/outline/question-mark.svg?raw';
import search from '@tabler/icons/outline/search.svg?raw';
import settings from '@tabler/icons/outline/settings.svg?raw';
import sparkles from '@tabler/icons/outline/sparkles.svg?raw';
import square from '@tabler/icons/outline/square.svg?raw';
import sun from '@tabler/icons/outline/sun.svg?raw';
import terminal2 from '@tabler/icons/outline/terminal-2.svg?raw';
import user from '@tabler/icons/outline/user.svg?raw';
import x from '@tabler/icons/outline/x.svg?raw';
import adjustmentsHorizontal from '@tabler/icons/outline/adjustments-horizontal.svg?raw';
import arrowLeft from '@tabler/icons/outline/arrow-left.svg?raw';
import box from '@tabler/icons/outline/box.svg?raw';
import cpu from '@tabler/icons/outline/cpu.svg?raw';
import cube from '@tabler/icons/outline/cube.svg?raw';
import deviceLaptop from '@tabler/icons/outline/device-laptop.svg?raw';
import messageCircle from '@tabler/icons/outline/message-circle.svg?raw';
import messageCirclePlus from '@tabler/icons/outline/message-circle-plus.svg?raw';
import messagePlus from '@tabler/icons/outline/message-plus.svg?raw';
import palette from '@tabler/icons/outline/palette.svg?raw';
import quote from '@tabler/icons/outline/quote.svg?raw';
import refresh from '@tabler/icons/outline/refresh.svg?raw';
import selector from '@tabler/icons/outline/selector.svg?raw';
import send from '@tabler/icons/outline/send.svg?raw';
import shieldCheck from '@tabler/icons/outline/shield-check.svg?raw';
import trash from '@tabler/icons/outline/trash.svg?raw';
import wand from '@tabler/icons/outline/wand.svg?raw';
import lucideFolderClosed from 'lucide-static/icons/folder-closed.svg?raw';
import lucideFolderOpen from 'lucide-static/icons/folder-open.svg?raw';
import lucideGitBranch from 'lucide-static/icons/git-branch.svg?raw';
import lucideChevronsUpDown from 'lucide-static/icons/chevrons-up-down.svg?raw';
import lucideInfo from 'lucide-static/icons/info.svg?raw';

export const ICONS = {
  'arrows-minimize': arrowsMinimize,
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
  dots,
  download,
  'external-link': externalLink,
  'filter-2': filter2,
  folder,
  'folder-plus': folderPlus,
  'git-branch': gitBranch,
  'git-fork': gitFork,
  history,
  keyboard,
  'list-details': listDetails,
  'loader-2': loader2,
  lock,
  message,
  minus,
  moon,
  notebook,
  plus,
  'question-mark': questionMark,
  search,
  settings,
  sparkles,
  square,
  sun,
  'terminal-2': terminal2,
  user,
  x,
  'adjustments-horizontal': adjustmentsHorizontal,
  'arrow-left': arrowLeft,
  box: box,
  cpu: cpu,
  cube: cube,
  'device-laptop': deviceLaptop,
  'message-circle': messageCircle,
  'message-circle-plus': messageCirclePlus,
  'message-plus': messagePlus,
  palette: palette,
  quote: quote,
  refresh: refresh,
  selector,
  send: send,
  'shield-check': shieldCheck,
  trash: trash,
  wand: wand,
  'lucide-folder-closed': lucideFolderClosed,
  'lucide-folder-open': lucideFolderOpen,
  'lucide-git-branch': lucideGitBranch,
  'lucide-chevrons-up-down': lucideChevronsUpDown,
  'lucide-info': lucideInfo,
} as const;

export type IconName = keyof typeof ICONS;

const SVG_BODY = /<svg[^>]*>([\s\S]*)<\/svg>/;

export interface IconOptions {
  size?: number;
  // The app draws Tabler at 1.5 instead of its default 2.
  stroke?: number;
  className?: string;
  label?: string;
}

// Our own <svg> wrapper: Tabler's bakes in width/height 24 and stroke-width 2.
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
