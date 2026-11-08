import {
  IconArchive,
  IconCube,
  IconMessageDots,
  IconPalette,
  IconWand,
  type Icon,
} from '@tabler/icons-react';
import {
  npmNameFromSource,
  PI_RESOURCE_KINDS,
  type InstalledPiPackage,
  type PiExtensionLoadError,
  type PiPackageAction,
  type PiResource,
  type PiResourceKind,
} from '../../../../shared/piPackages';
import { formatTimeAgo } from '@/lib/utils';

export const RESOURCE_KIND_LABELS: Record<PiResourceKind, { one: string; many: string }> = {
  extensions: { one: 'extension', many: 'extensions' },
  skills: { one: 'skill', many: 'skills' },
  prompts: { one: 'prompt', many: 'prompts' },
  themes: { one: 'theme', many: 'themes' },
};

export const RESOURCE_KIND_ICONS: Record<PiResourceKind, Icon> = {
  extensions: IconCube,
  skills: IconWand,
  prompts: IconMessageDots,
  themes: IconPalette,
};

/** A catalog package whose keywords name no kind. */
export const UNKNOWN_KIND_ICON: Icon = IconArchive;

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

/** `https://github.com/a/b.git` reads as `github.com/a/b`. */
function displaySource(source: string): string {
  return source
    .replace(/^git:/, '')
    .replace(/^(https?|ssh|git):\/\/(git@)?/, '')
    .replace(/\.git(@|$)/, '$1');
}

/** A git source's web page, for a manifest without `repository`. */
export function gitWebUrl(source: string): string | null {
  if (sourceKindLabel(source) !== 'Git repository') return null;
  const path = displaySource(source)
    .replace(/^git@([^:/]+):/, '$1/')
    .replace(/@[^/]*$/, '');
  return `https://${path}`;
}

/**
 * What the user installed, not package.json's name: a git repo's manifest can
 * name something it no longer contains.
 */
export function packageTitle(pkg: Pick<InstalledPiPackage, 'source'>): string {
  return npmNameFromSource(pkg.source) ?? displaySource(pkg.source);
}

/**
 * The kinds present, most numerous first (ties in pi's order): the first picks
 * the card's icon, so 1 extension and 33 skills reads as a skill package.
 */
export function resourceKinds(resources: readonly PiResource[]): PiResourceKind[] {
  const count = (kind: PiResourceKind): number =>
    resources.filter((resource) => resource.kind === kind).length;
  return PI_RESOURCE_KINDS.filter((kind) => count(kind) > 0).sort((a, b) => count(b) - count(a));
}

/** "Nico · 3d ago": who wrote it and how old the installed version is. */
export function installedMeta(
  pkg: InstalledPiPackage,
  releasedAt: string | null,
  now: number,
): string | null {
  return (
    [pkg.author, releasedAt ? formatTimeAgo(releasedAt, now) : null].filter(Boolean).join(' · ') ||
    null
  );
}
