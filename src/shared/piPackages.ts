/**
 * Pi packages: what is installed, what the catalog offers, and how a line the
 * user typed becomes a package source. Shared by the package worker (which runs
 * pi's own `DefaultPackageManager`), main (catalog search, IPC validation) and
 * the renderer.
 */

/** pi's own names: `user` is `~/.pi/agent/settings.json`, `project` is `.pi/settings.json`. */
export type PiPackageScope = 'user' | 'project';

export const PI_RESOURCE_KINDS = ['extensions', 'skills', 'prompts', 'themes'] as const;
export type PiResourceKind = (typeof PI_RESOURCE_KINDS)[number];

export interface PiResource {
  kind: PiResourceKind;
  name: string;
  path: string;
  scope: PiPackageScope;
  /** False when a package filter or a settings override turned it off. */
  enabled: boolean;
  description?: string;
}

export interface InstalledPiPackage {
  /** The source as written in settings.json, which is also its identity for remove/update. */
  source: string;
  scope: PiPackageScope;
  version: string | null;
  description: string | null;
  /** Null when settings name the package but it is not installed. */
  installedPath: string | null;
  repositoryUrl: string | null;
  resources: PiResource[];
}

export interface PiPackagesSnapshot {
  packages: InstalledPiPackage[];
  /** Resources that come from no package: pi's own directories and settings paths. */
  local: PiResource[];
  /** Null without a project; otherwise whether pi applies the project's settings. */
  projectTrusted: boolean | null;
}

export interface PiExtensionLoadError {
  path: string;
  error: string;
}

/** The slow half of the list: network update checks and loading the extensions. */
export interface PiPackagesHealth {
  /** Sources with a newer version than the one installed. */
  updates: string[];
  loadErrors: PiExtensionLoadError[];
}

export type PiPackageAction = 'install' | 'remove' | 'update';

export interface PiPackageOperation {
  action: PiPackageAction;
  source: string;
  scope: PiPackageScope;
}

export type PiPackagesResult =
  | { success: true; snapshot: PiPackagesSnapshot }
  | { success: false; error: string };

export type PiPackagesHealthResult =
  | { success: true; health: PiPackagesHealth }
  | { success: false; error: string };

export type PiPackageOperationResult =
  /** `loadErrors`: the installed or updated package's extensions that throw on load. */
  | { success: true; loadErrors: PiExtensionLoadError[] }
  /** `log` is npm's and git's own output, the only place the real cause is. */
  | { success: false; error: string; log: string };

// =============================================================================
// Failures
// =============================================================================

const NPM_ERROR_REASONS: Record<string, string> = {
  E404: 'Not found in the npm registry.',
  ENOTFOUND: 'Could not reach the npm registry.',
  ECONNREFUSED: 'Could not reach the npm registry.',
  ECONNRESET: 'The connection to the npm registry dropped.',
  ETIMEDOUT: 'The npm registry did not answer in time.',
  EACCES: 'npm has no permission to write the install folder.',
  ERESOLVE: 'npm could not resolve the package dependencies.',
};

/**
 * pi reports a failed npm or git run as "<command> failed with code 1"; the
 * reason is in their output. Picks the line a person needs, or null.
 */
export function failureReason(log: string): string | null {
  const lines = log.split('\n').map((line) => line.trim());
  const npmCode = lines
    .map((line) => line.match(/^npm (?:error|ERR!) code (\w+)/)?.[1])
    .find(Boolean);
  if (npmCode && NPM_ERROR_REASONS[npmCode]) return NPM_ERROR_REASONS[npmCode];
  const npmDetail = lines.find(
    (line) =>
      /^npm (?:error|ERR!) /.test(line) && !/ code \w+$|complete log of this run/.test(line),
  );
  if (npmDetail) return npmDetail.replace(/^npm (?:error|ERR!) /, '');
  const gitFatal = lines.find((line) => line.startsWith('fatal: ') || line.startsWith('ERROR: '));
  if (gitFatal) return gitFatal.replace(/^(fatal|ERROR): /, '');
  return null;
}

// =============================================================================
// Catalog
// =============================================================================

export interface CatalogPackage {
  name: string;
  version: string;
  description: string;
  /** npm username of the publisher, or the first maintainer. */
  author: string | null;
  /** ISO date of the latest publish. */
  date: string | null;
  /** Only registry.npmjs.org reports it; mirrors leave it out. */
  monthlyDownloads: number | null;
  /** From keywords, the way pi.dev labels its cards before reading a manifest. */
  kinds: PiResourceKind[];
  repositoryUrl: string | null;
}

export type CatalogSearchResult =
  | { success: true; packages: CatalogPackage[]; registry: string }
  | { success: false; error: string };

export interface CatalogPackageDetail {
  readme: string | null;
  repositoryUrl: string | null;
  kinds: PiResourceKind[];
  license: string | null;
  homepage: string | null;
}

export type CatalogPackageDetailResult =
  | { success: true; detail: CatalogPackageDetail }
  | { success: false; error: string };

/** The keyword every pi package carries; it is what the pi.dev gallery lists. */
export const PI_PACKAGE_KEYWORD = 'pi-package';

const KIND_KEYWORDS: Record<PiResourceKind, readonly string[]> = {
  extensions: ['extension', 'extensions', 'pi-extension'],
  skills: ['skill', 'skills', 'pi-skill'],
  prompts: ['prompt', 'prompts', 'pi-prompt'],
  themes: ['theme', 'themes', 'pi-theme'],
};

export function resourceKindsFromKeywords(keywords: readonly string[]): PiResourceKind[] {
  const lower = new Set(keywords.map((keyword) => keyword.toLowerCase()));
  return PI_RESOURCE_KINDS.filter((kind) => KIND_KEYWORDS[kind].some((k) => lower.has(k)));
}

export function npmPackageUrl(name: string): string {
  return `https://www.npmjs.com/package/${name}`;
}

export const PI_DEV_PACKAGES_URL = 'https://pi.dev/packages';

export function piDevPackageUrl(name: string): string {
  return `${PI_DEV_PACKAGES_URL}/${name}`;
}

/** A package.json `repository` (string, object, `git+`, scp-like or `user/repo`) as a browsable URL. */
export function repositoryUrlFromManifest(manifest: Record<string, unknown> | null): string | null {
  const repository = manifest?.['repository'];
  const raw =
    typeof repository === 'string'
      ? repository
      : typeof repository === 'object' && repository !== null && 'url' in repository
        ? repository.url
        : null;
  if (typeof raw !== 'string') return null;
  const url = raw
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^(ssh:\/\/)?git@([^:/]+)[:/]/, 'https://$2/')
    .replace(/\.git$/, '');
  if (url.startsWith('https://')) return url;
  // npm's shorthand: "user/repo" means GitHub.
  return /^[\w.-]+\/[\w.-]+$/.test(url) ? `https://github.com/${url}` : null;
}

// =============================================================================
// Preview images
// =============================================================================

/**
 * Package images reach the renderer through main: the CSP loads no remote
 * image, and the address names a package, not a URL, so a page cannot use
 * it to fetch an arbitrary address.
 */
export const PACKAGE_IMAGE_SCHEME = 'package-image';

export type PackageImageTarget = { npm: string } | { path: string };

export function packageImageUrl(target: PackageImageTarget): string {
  return 'npm' in target
    ? `${PACKAGE_IMAGE_SCHEME}://npm/${encodeURIComponent(target.npm)}`
    : `${PACKAGE_IMAGE_SCHEME}://path/${encodeURIComponent(target.path)}`;
}

export function parsePackageImageUrl(url: string): PackageImageTarget | null {
  const match = url.match(new RegExp(`^${PACKAGE_IMAGE_SCHEME}://(npm|path)/([^?#]+)`));
  if (!match?.[2]) return null;
  try {
    const value = decodeURIComponent(match[2]);
    return match[1] === 'npm' ? { npm: value } : { path: value };
  } catch {
    return null;
  }
}

/** package.json `pi.image`, held to what pi.dev shows: an http(s) PNG, JPEG, GIF or WebP. */
export function imageUrlFromManifest(manifest: Record<string, unknown> | null): string | null {
  const pi = manifest?.['pi'];
  const image = typeof pi === 'object' && pi !== null && 'image' in pi ? pi.image : null;
  if (typeof image !== 'string') return null;
  try {
    const url = new URL(image);
    return /^https?:$/.test(url.protocol) && /\.(png|jpe?g|gif|webp)$/i.test(url.pathname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/** The npm name a source installs, or null for git and local sources. */
export function npmNameFromSource(source: string): string | null {
  if (!source.startsWith('npm:')) return null;
  const spec = source.slice('npm:'.length);
  // A scoped name keeps its first @; the version separator is the next one.
  const versionAt = spec.indexOf('@', spec.startsWith('@') ? 1 : 0);
  return versionAt === -1 ? spec : spec.slice(0, versionAt);
}

// =============================================================================
// Input
// =============================================================================

export type PackageInput =
  | { kind: 'empty' }
  | { kind: 'search'; query: string }
  | { kind: 'source'; source: string };

const NPM_NAME = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(@[^\s/]+)?$/i;
const PROTOCOL_SOURCE = /^(https?|ssh|git):\/\//;
const PACKAGE_PAGE_URLS = [
  /^https?:\/\/(?:www\.)?npmjs\.com\/package\/((?:@[^/\s]+\/)?[^/\s?#]+)/,
  /^https?:\/\/pi\.dev\/packages\/((?:@[^/\s]+\/)?[^/\s?#]+)/,
];

function sourceFromToken(token: string, fromInstallCommand: boolean): string | null {
  for (const pattern of PACKAGE_PAGE_URLS) {
    const match = token.match(pattern);
    if (match?.[1]) return `npm:${decodeURIComponent(match[1])}`;
  }
  if (/^(npm|git):./.test(token)) return token;
  if (PROTOCOL_SOURCE.test(token)) return token;
  // pi only takes the scp-like form behind `git:`.
  if (/^[\w.-]+@[\w.-]+:/.test(token)) return `git:${token}`;
  if (/^(\/|~\/|\.\.?\/)/.test(token)) return token;
  // pi would read a bare word as a relative path; nobody types that at a GUI.
  if (fromInstallCommand && NPM_NAME.test(token)) return `npm:${token}`;
  return null;
}

/**
 * What a line in the packages field asks for: a source to install (`pi install
 * npm:foo`, `npm:foo`, a git URL, a path, an npm or pi.dev package page), or a
 * catalog search. A bare word is a search; after `pi install` it is an npm
 * name. Flags are dropped: pigi installs every package globally, `-l` too.
 */
export function parsePackageInput(text: string): PackageInput {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { kind: 'empty' };
  const fromInstallCommand = tokens[0] === 'pi' && tokens[1] === 'install' && tokens.length > 2;
  const rest = fromInstallCommand ? tokens.slice(2) : tokens;
  const words = rest.filter((token) => !token.startsWith('-'));
  const [word] = words;
  if (words.length === 1 && word) {
    const source = sourceFromToken(word, fromInstallCommand);
    if (source) return { kind: 'source', source };
  }
  return { kind: 'search', query: text.trim() };
}
