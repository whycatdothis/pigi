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
/** A catalog page shows far fewer cards than this; scrolled further, an evicted
 *  image is fetched again rather than kept for the whole app run. */
const MAX_CACHED_IMAGES = 100;

interface PackageImage {
  type: string;
  bytes: ArrayBuffer;
}

/** Insertion-ordered: the first key is the oldest, which is what eviction drops. */
const imagesByTarget = new Map<string, Promise<PackageImage | null>>();

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

function cacheImage(key: string, image: Promise<PackageImage | null>): void {
  imagesByTarget.set(key, image);
  while (imagesByTarget.size > MAX_CACHED_IMAGES) {
    const oldest = imagesByTarget.keys().next();
    if (oldest.done) return;
    imagesByTarget.delete(oldest.value);
  }
}

export async function handlePackageImageRequest(request: Request): Promise<Response> {
  const target = parsePackageImageUrl(request.url);
  if (!target) return new Response(null, { status: 400 });
  const key = JSON.stringify(target);
  let image = imagesByTarget.get(key);
  if (!image) {
    image = loadImage(target);
    cacheImage(key, image);
    // A network failure may pass; only a definite answer is kept.
    image.catch(() => imagesByTarget.delete(key));
  }
  const loaded = await image.catch(() => null);
  return loaded
    ? new Response(loaded.bytes, { headers: { 'content-type': loaded.type } })
    : new Response(null, { status: 404 });
}
