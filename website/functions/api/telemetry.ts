/**
 * Receives the desktop app's telemetry and stores it in Workers
 * Analytics Engine. The app side and the column layout are in the app repo's
 * docs/telemetry.md.
 *
 * The endpoint is public, like any analytics key, so it only accepts the shape
 * the app sends and caps its size. The country comes from Cloudflare's lookup;
 * the IP is never stored.
 */

interface DataPoint {
  indexes: string[];
  blobs: string[];
  doubles: number[];
}

interface Env {
  // Bound in the Pages project settings; absent on deployments without it.
  TELEMETRY?: { writeDataPoint(point: DataPoint): void };
}

interface Context {
  request: Request & { cf?: { country?: unknown } };
  env: Env;
}

const MAX_BODY_LENGTH = 128 * 1024;
const MAX_EVENTS = 100;
const MAX_FIELDS = 4;
const MAX_FIELD_LENGTH = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHORT_TOKEN = /^[\w.+-]{1,32}$/;
const EVENT_NAME = /^[a-z_]{1,32}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isShortToken(value: unknown): value is string {
  return typeof value === 'string' && SHORT_TOKEN.test(value);
}

function toDataPoint(event: unknown, base: string[], installId: string): DataPoint | null {
  if (!isRecord(event) || typeof event.name !== 'string' || !EVENT_NAME.test(event.name)) {
    return null;
  }
  const fields = event.fields ?? [];
  if (
    !Array.isArray(fields) ||
    fields.length > MAX_FIELDS ||
    !fields.every((field) => typeof field === 'string' && field.length <= MAX_FIELD_LENGTH)
  ) {
    return null;
  }
  const value = event.value;
  if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) return null;
  return {
    // The install id is the sampling key, so sampling keeps or drops whole installs.
    indexes: [installId],
    blobs: [event.name, ...base, ...fields],
    doubles: value === undefined ? [] : [value],
  };
}

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  // Requiring JSON makes a cross-site browser post need CORS, which is never
  // granted, so a web page cannot make its visitors send events.
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return new Response(null, { status: 415 });
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY_LENGTH) {
    return new Response(null, { status: 413 });
  }
  const body = await request.text();
  if (body.length > MAX_BODY_LENGTH) return new Response(null, { status: 413 });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (
    !isRecord(payload) ||
    typeof payload.installId !== 'string' ||
    !UUID.test(payload.installId) ||
    !isShortToken(payload.appVersion) ||
    !isShortToken(payload.osVersion) ||
    !isShortToken(payload.arch) ||
    !Array.isArray(payload.events) ||
    payload.events.length > MAX_EVENTS
  ) {
    return new Response(null, { status: 400 });
  }

  const country = typeof request.cf?.country === 'string' ? request.cf.country : '';
  const base = [payload.appVersion, payload.osVersion, payload.arch, country];
  for (const event of payload.events) {
    const point = toDataPoint(event, base, payload.installId);
    if (!point) continue;
    try {
      env.TELEMETRY?.writeDataPoint(point);
    } catch {
      // Over a limit (blob bytes): this one is dropped, the rest still count.
    }
  }
  return new Response(null, { status: 204 });
}
