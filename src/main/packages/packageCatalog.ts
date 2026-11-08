/**
 * The pi package catalog, read from an npm registry.
 *
 * pi.dev/packages has no public API (its `/api/*` answers "reserved for future
 * features"); the gallery itself is npm's search for the `pi-package` keyword.
 * So this asks the registry directly: registry.npmjs.org first, since only it
 * reports downloads, then the registry npm is configured with, which is what a
 * network that blocks npmjs (a company proxy, a mirror) can reach — and what
 * `pi install` will download from anyway.
 */
import { execFile } from 'node:child_process';
import { net } from 'electron';
import {
  PI_PACKAGE_KEYWORD,
  PI_RESOURCE_KINDS,
  repositoryUrlFromManifest,
  resourceKindsFromKeywords,
  type CatalogPackage,
  type CatalogPackageDetail,
  type PiResourceKind,
} from '../../shared/piPackages';

const OFFICIAL_REGISTRY = 'https://registry.npmjs.org/';
/** Short: on a network that blocks npmjs this is pure wait before the fallback. */
const OFFICIAL_REGISTRY_TIMEOUT_MS = 4_000;
const REGISTRY_TIMEOUT_MS = 15_000;
const NPM_CONFIG_TIMEOUT_MS = 5_000;
/** The registry's page limit; also how many of the most downloaded the empty query returns. */
const BROWSE_PAGE_SIZE = 250;
/** pi.dev lists ~5,300 packages; this bounds the paging if `total` is ever absurd. */
const MAX_BROWSE_PAGES = 40;
const SEARCH_PAGE_SIZE = 50;

/** The registry that answered last; tried first next time. */
let workingRegistry: string | null = null;
let configuredRegistryPromise: Promise<string | null> | null = null;

function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function readConfiguredRegistry(): Promise<string | null> {
  configuredRegistryPromise ??= new Promise((resolve) => {
    execFile(
      'npm',
      ['config', 'get', 'registry'],
      { timeout: NPM_CONFIG_TIMEOUT_MS },
      (error, stdout) => {
        const url = stdout.trim();
        resolve(!error && /^https?:\/\//.test(url) ? withTrailingSlash(url) : null);
      },
    );
  });
  return configuredRegistryPromise;
}

async function registriesToTry(): Promise<string[]> {
  const configured = await readConfiguredRegistry();
  const candidates = [workingRegistry, OFFICIAL_REGISTRY, configured];
  return [...new Set(candidates.filter((url): url is string => url !== null))];
}

/** Runs `request` against each registry until one succeeds; the last error is the report. */
async function withRegistry<T>(
  request: (registry: string, timeoutMs: number) => Promise<T>,
): Promise<{ value: T; registry: string }> {
  let lastError: unknown = null;
  for (const registry of await registriesToTry()) {
    try {
      const timeoutMs =
        registry === OFFICIAL_REGISTRY && registry !== workingRegistry
          ? OFFICIAL_REGISTRY_TIMEOUT_MS
          : REGISTRY_TIMEOUT_MS;
      const value = await request(registry, timeoutMs);
      workingRegistry = registry;
      return { value, registry };
    } catch (error) {
      lastError = error;
    }
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Could not reach the npm registry (${reason})`);
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const response = await net.fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringAt(record: unknown, key: string): string | null {
  if (!isRecord(record)) return null;
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringsAt(record: unknown, key: string): string[] {
  if (!isRecord(record)) return [];
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function toCatalogPackage(searchObject: unknown): CatalogPackage | null {
  if (!isRecord(searchObject)) return null;
  const pkg = searchObject['package'];
  const name = stringAt(pkg, 'name');
  const keywords = stringsAt(pkg, 'keywords');
  // Mirrors mix their own packages into the results and some ignore the
  // `keywords:` qualifier, so the keyword is checked here, not trusted.
  if (!isRecord(pkg) || !name || !keywords.includes(PI_PACKAGE_KEYWORD)) return null;
  const downloads = searchObject['downloads'];
  const monthly = isRecord(downloads) ? downloads['monthly'] : null;
  const maintainers = pkg['maintainers'];
  const firstMaintainer = Array.isArray(maintainers) ? maintainers[0] : null;
  return {
    name,
    version: stringAt(pkg, 'version') ?? '',
    description: stringAt(pkg, 'description') ?? '',
    author:
      stringAt(pkg['publisher'], 'username') ??
      stringAt(firstMaintainer, 'username') ??
      stringAt(pkg['author'], 'name'),
    date: stringAt(pkg, 'date'),
    monthlyDownloads: typeof monthly === 'number' ? monthly : null,
    kinds: resourceKindsFromKeywords(keywords),
    repositoryUrl: stringAt(pkg['links'], 'repository'),
  };
}

interface SearchPage {
  packages: CatalogPackage[];
  /** Matches the registry reports, before the keyword filter. */
  total: number;
}

async function searchOnce(
  registry: string,
  text: string,
  size: number,
  timeoutMs: number,
  from = 0,
): Promise<SearchPage> {
  const url = `${registry}-/v1/search?text=${encodeURIComponent(text)}&size=${size}&from=${from}`;
  const body = await fetchJson(url, timeoutMs);
  const objects = isRecord(body) && Array.isArray(body['objects']) ? body['objects'] : [];
  const total = isRecord(body) && typeof body['total'] === 'number' ? body['total'] : 0;
  return {
    packages: objects.map(toCatalogPackage).filter((pkg): pkg is CatalogPackage => pkg !== null),
    total,
  };
}

/**
 * Search order is relevance, not downloads, so the most downloaded can sit on
 * any page: like pi.dev, read them all and rank. Pointless without download
 * counts (mirrors report none), so then the first page is the list.
 */
async function browseAll(
  registry: string,
  text: string,
  first: SearchPage,
): Promise<CatalogPackage[]> {
  if (!first.packages.some((pkg) => pkg.monthlyDownloads !== null)) return first.packages;
  const pageCount = Math.min(Math.ceil(first.total / BROWSE_PAGE_SIZE), MAX_BROWSE_PAGES);
  const rest = await Promise.allSettled(
    Array.from({ length: Math.max(pageCount - 1, 0) }, (_, index) =>
      searchOnce(
        registry,
        text,
        BROWSE_PAGE_SIZE,
        REGISTRY_TIMEOUT_MS,
        (index + 1) * BROWSE_PAGE_SIZE,
      ),
    ),
  );
  // A lost page costs a few entries, not the list.
  const pages = rest.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  const byName = new Map<string, CatalogPackage>();
  for (const pkg of [first, ...pages].flatMap((page) => page.packages)) byName.set(pkg.name, pkg);
  return [...byName.values()]
    .sort((a, b) => (b.monthlyDownloads ?? 0) - (a.monthlyDownloads ?? 0))
    .slice(0, BROWSE_PAGE_SIZE);
}

/** Empty query: the most downloaded packages. Otherwise the registry's relevance order. */
export async function searchCatalog(
  query: string,
): Promise<{ packages: CatalogPackage[]; registry: string }> {
  const trimmed = query.trim();
  const size = trimmed ? SEARCH_PAGE_SIZE : BROWSE_PAGE_SIZE;
  const { value, registry } = await withRegistry(async (registryUrl, timeoutMs) => {
    const qualifiedText = `keywords:${PI_PACKAGE_KEYWORD} ${trimmed}`.trim();
    let text = qualifiedText;
    let first = await searchOnce(registryUrl, text, size, timeoutMs);
    if (first.packages.length === 0) {
      // npmmirror answers `keywords:` with nothing; plain text still finds the keyword.
      text = `${PI_PACKAGE_KEYWORD} ${trimmed}`.trim();
      first = await searchOnce(registryUrl, text, size, timeoutMs);
    }
    return trimmed ? first.packages : browseAll(registryUrl, text, first);
  });
  return { packages: value, registry };
}

function kindsFromManifest(manifest: unknown): PiResourceKind[] {
  const pi = isRecord(manifest) ? manifest['pi'] : null;
  if (!isRecord(pi)) return [];
  return PI_RESOURCE_KINDS.filter((kind) => {
    const entries = pi[kind];
    return Array.isArray(entries) && entries.length > 0;
  });
}

/** The latest version's package.json: small, unlike the packument, but without the README. */
export async function fetchLatestManifest(name: string): Promise<Record<string, unknown> | null> {
  const { value } = await withRegistry((registry, timeoutMs) =>
    fetchJson(`${registry}${name.replace('/', '%2F')}/latest`, timeoutMs),
  );
  return isRecord(value) ? value : null;
}

export async function getCatalogPackage(name: string): Promise<CatalogPackageDetail> {
  // A scoped name keeps its @ and escapes the slash, as npm itself requests it.
  const path = name.replace('/', '%2F');
  const { value } = await withRegistry((registry, timeoutMs) =>
    fetchJson(`${registry}${path}`, timeoutMs),
  );
  const latestVersion = stringAt(isRecord(value) ? value['dist-tags'] : null, 'latest');
  const versions = isRecord(value) ? value['versions'] : null;
  const latest = latestVersion && isRecord(versions) ? versions[latestVersion] : null;
  return {
    readme: stringAt(value, 'readme') ?? stringAt(latest, 'readme'),
    repositoryUrl: repositoryUrlFromManifest(
      isRecord(latest) ? latest : isRecord(value) ? value : null,
    ),
    kinds: kindsFromManifest(latest),
    license: stringAt(latest, 'license') ?? stringAt(value, 'license'),
    homepage: stringAt(latest, 'homepage') ?? stringAt(value, 'homepage'),
  };
}
