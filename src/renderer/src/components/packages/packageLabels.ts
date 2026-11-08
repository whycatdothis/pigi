import { IconBook2, IconPalette, IconPrompt, IconPuzzle, type Icon } from '@tabler/icons-react';
import {
  PI_RESOURCE_KINDS,
  type InstalledPiPackage,
  type PiExtensionLoadError,
  type PiPackageAction,
  type PiResource,
  type PiResourceKind,
} from '../../../../shared/piPackages';

export const RESOURCE_KIND_LABELS: Record<PiResourceKind, { one: string; many: string }> = {
  extensions: { one: 'extension', many: 'extensions' },
  skills: { one: 'skill', many: 'skills' },
  prompts: { one: 'prompt', many: 'prompts' },
  themes: { one: 'theme', many: 'themes' },
};

export const RESOURCE_KIND_ICONS: Record<PiResourceKind, Icon> = {
  extensions: IconPuzzle,
  skills: IconBook2,
  prompts: IconPrompt,
  themes: IconPalette,
};

/** "2 extensions · 1 skill" */
export function resourceSummary(resources: readonly PiResource[]): string {
  return PI_RESOURCE_KINDS.flatMap((kind) => {
    const count = resources.filter((resource) => resource.kind === kind).length;
    if (count === 0) return [];
    const label = RESOURCE_KIND_LABELS[kind];
    return [`${count} ${count === 1 ? label.one : label.many}`];
  }).join(' · ');
}

export function formatDownloads(monthly: number): string {
  if (monthly >= 1_000_000) return `${(monthly / 1_000_000).toFixed(1).replace(/\.0$/, '')}M/mo`;
  if (monthly >= 1_000) return `${(monthly / 1_000).toFixed(1).replace(/\.0$/, '')}k/mo`;
  return `${monthly}/mo`;
}

export const ACTION_PROGRESS_LABELS: Record<PiPackageAction, string> = {
  install: 'Installing',
  remove: 'Removing',
  update: 'Updating',
};

export const ACTION_FAILURE_LABELS: Record<PiPackageAction, string> = {
  install: 'Could not install',
  remove: 'Could not remove',
  update: 'Could not update',
};

export const ACTION_SUCCESS_LABELS: Record<PiPackageAction, string> = {
  install: 'Installed',
  remove: 'Removed',
  update: 'Updated',
};

/** What a source points at, for the line under it. */
export function sourceKindLabel(source: string): string {
  if (source.startsWith('npm:')) return 'npm package';
  if (source.startsWith('git:') || /^(https?|ssh|git):\/\//.test(source)) return 'Git repository';
  return 'Local path';
}

/** Load errors from extensions inside this package's folder. */
export function errorsForPackage(
  pkg: InstalledPiPackage,
  loadErrors: readonly PiExtensionLoadError[],
): PiExtensionLoadError[] {
  const root = pkg.installedPath;
  if (!root) return [];
  return loadErrors.filter((error) => error.path === root || error.path.startsWith(`${root}/`));
}
