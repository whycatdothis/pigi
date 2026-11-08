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

interface PackageImage {
  type: string;
  bytes: ArrayBuffer;
}

/** Per window lifetime: a card list re-renders often and an image rarely changes. */
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

async function loadImage(target: PackageImageTarget): Promise<PackageImage | null> {
  const manifest =
    'npm' in target ? await fetchLatestManifest(target.npm) : readManifest(target.path);
  const url = imageUrlFromManifest(manifest);
  if (!url) return null;
  const response = await net.fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !type.startsWith('image/')) return null;
  const bytes = await response.arrayBuffer();
  return bytes.byteLength <= MAX_IMAGE_BYTES ? { type, bytes } : null;
}

export async function handlePackageImageRequest(request: Request): Promise<Response> {
  const target = parsePackageImageUrl(request.url);
  if (!target) return new Response(null, { status: 400 });
  const key = JSON.stringify(target);
  let image = imagesByTarget.get(key);
  if (!image) {
    image = loadImage(target);
    imagesByTarget.set(key, image);
    // A network failure may pass; only a definite answer is kept.
    image.catch(() => imagesByTarget.delete(key));
  }
  const loaded = await image.catch(() => null);
  return loaded
    ? new Response(loaded.bytes, { headers: { 'content-type': loaded.type } })
    : new Response(null, { status: 404 });
}
