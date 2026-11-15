/**
 * Serves `package-image://` for the packages page: the `pi.image` a package's
 * manifest names (pi.dev's gallery field), fetched here because the window's
 * CSP loads no remote image. No image, or one that fails, is a 404 and the
 * card keeps its icon.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { net } from 'electron';
import {
  imageUrlFromManifest,
  parsePackageImageUrl,
  type PackageImageTarget,
} from '../../shared/piPackages';
import { fetchLatestManifest } from './packageCatalog';

const IMAGE_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** A budget, not a count: one card's image can be five megabytes. */
const MAX_CACHED_IMAGE_BYTES = 32 * 1024 * 1024;
/** A catalog page shows far fewer cards than this; scrolled further, an evicted
 *  image is fetched again rather than kept for the whole app run. */
const MAX_CACHED_IMAGES = 100;

interface PackageImage {
  type: string;
  bytes: ArrayBuffer;
}

interface CachedImage {
  image: Promise<PackageImage | null>;
  /** Set when the fetch settles; 0 while in flight. */
  bytes: number;
}

/** Insertion-ordered: the oldest entries are what eviction drops first. */
const imagesByTarget = new Map<string, CachedImage>();

function readManifest(directory: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed))
      : null;
  } catch {
    return null;
  }
}

/** Reads at most MAX_IMAGE_BYTES, or null as soon as the body passes it. */
async function readCapped(body: ReadableStream<Uint8Array> | null): Promise<ArrayBuffer | null> {
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

async function loadImage(target: PackageImageTarget): Promise<PackageImage | null> {
  const manifest =
    'npm' in target ? await fetchLatestManifest(target.npm) : readManifest(target.path);
  const url = imageUrlFromManifest(manifest);
  if (!url) return null;
  const response = await net.fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !type.startsWith('image/')) return null;
  // Refuse before reading when the server says how big it is; the read below
  // still checks, since a manifest can lie.
  const announced = Number(response.headers.get('content-length'));
  if (Number.isFinite(announced) && announced > MAX_IMAGE_BYTES) return null;
  const bytes = await readCapped(response.body);
  return bytes ? { type, bytes } : null;
}

/** Drops the oldest entries until both caps fit; insertion order is age order. */
function evictCachedImages(): void {
  let total = 0;
  for (const cached of imagesByTarget.values()) total += cached.bytes;
  for (const [key, cached] of imagesByTarget) {
    if (total <= MAX_CACHED_IMAGE_BYTES && imagesByTarget.size <= MAX_CACHED_IMAGES) break;
    imagesByTarget.delete(key);
    total -= cached.bytes;
  }
}

function cacheImage(key: string, image: Promise<PackageImage | null>): CachedImage {
  const entry: CachedImage = { image, bytes: 0 };
  imagesByTarget.set(key, entry);
  void image.then(
    // A settled fetch counts against the budget; an in-flight one does not.
    (loaded) => {
      entry.bytes = loaded?.bytes.byteLength ?? 0;
      evictCachedImages();
    },
    // Offline and timed-out fetches are expected, not crashes: they are dropped
    // here rather than surfacing as unhandled rejections. Identity-checked, so
    // a stale failure cannot evict a newer retry of the same image.
    () => {
      if (imagesByTarget.get(key) === entry) imagesByTarget.delete(key);
    },
  );
  evictCachedImages();
  return entry;
}

export async function handlePackageImageRequest(request: Request): Promise<Response> {
  const target = parsePackageImageUrl(request.url);
  if (!target) return new Response(null, { status: 400 });
  const key = JSON.stringify(target);
  const cached = imagesByTarget.get(key) ?? cacheImage(key, loadImage(target));
  // A network failure may pass; only a definite answer is kept (and `cacheImage`
  // already dropped the entry for it).
  const loaded = await cached.image.catch(() => null);
  return loaded
    ? new Response(loaded.bytes, { headers: { 'content-type': loaded.type } })
    : new Response(null, { status: 404 });
}
