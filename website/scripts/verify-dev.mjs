/**
 * Checks the page in a **dev** server, not just in `dist/`.
 *
 * `verify-interactions.mjs` drives the built site, and the build is Rollup
 * resolving a fresh graph of imports from nothing. Dev is a different pipeline:
 * Vite serves the components over SSR, keeps a module graph across edits, and
 * watches the filesystem for new ones. The two can disagree, and when they do it
 * is dev that breaks — a component renamed or added while the server was running
 * can leave the graph holding a path that no longer exists, and the page answers
 * with `FailedToLoadModuleSSR` while `astro check`, `astro build` and every
 * screenshot of `dist/` are perfectly happy. That is not hypothetical: it is how
 * this script came to exist.
 *
 * So there are two passes here.
 *
 * 1. A dev server that is already running (Astro records it in `.astro/dev.json`)
 *    is asked for both pages. This is the pass that catches the stale graph,
 *    because the stale graph lives in that process and in no other.
 * 2. A second server is started from nothing, on a port of its own and with
 *    `--ignore-lock` so it does not disturb the one above, and asked the same two
 *    questions. This is the pass that catches a page only dev fails to render —
 *    a bad import, an SSR-only crash — before it reaches anybody's browser.
 *
 * Both passes assert the same three things: a 200, none of Astro's error payload
 * in the body, and the page's own <h1>. Run it with `npm run verify`.
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PAGES = ['/', '/changelog'];

/** Astro's own error payload, in the body of a failed dev render. */
const ERROR_MARKERS = ['FailedToLoadModuleSSR', 'astro-error-overlay', 'Internal server error'];

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
}

/**
 * Astro's lock file for the running server, if there is one. It can outlive the
 * process that wrote it, so the caller still has to try the URL.
 */
async function runningDevServerUrl() {
  try {
    const data = JSON.parse(await readFile(join(ROOT, '.astro', 'dev.json'), 'utf8'));
    return typeof data.url === 'string' ? data.url.replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

async function fetchPage(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(20_000) });
  const body = await response.text();
  return { status: response.status, body };
}

/**
 * The page answered, and it is the page: no error payload, and the heading the
 * page is built around. A dev server that cannot resolve a component still
 * answers, with a stack trace and a 500.
 */
function looksRendered(page) {
  return page.status === 200 && ERROR_MARKERS.every((marker) => !page.body.includes(marker));
}

async function checkServer(name, baseUrl) {
  for (const path of PAGES) {
    let page;
    try {
      page = await fetchPage(baseUrl, path);
    } catch (error) {
      check(`${name}: ${path} answers`, false, String(error));
      continue;
    }
    const missingHeading = !page.body.includes('<h1');
    check(
      `${name}: ${path} renders`,
      looksRendered(page) && !missingHeading,
      `status ${page.status}${missingHeading ? ', no <h1>' : ''}`,
    );
  }
}

/** A port nothing is listening on, so the second server cannot collide. */
async function freePort() {
  const server = createServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address();
  await new Promise((done) => server.close(done));
  return port;
}

/** Poll until the server answers, whatever it answers with. */
async function waitForServer(baseUrl, timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(baseUrl, { signal: AbortSignal.timeout(2_000) });
      return true;
    } catch {
      await new Promise((done) => setTimeout(done, 250));
    }
  }
  return false;
}

// --- the server that is already running --------------------------------------
const runningUrl = await runningDevServerUrl();
if (runningUrl) {
  try {
    await fetch(runningUrl, { signal: AbortSignal.timeout(2_000) });
    await checkServer('dev (running)', runningUrl);
  } catch {
    check('dev (running): the dev server recorded in .astro/dev.json answers', false, runningUrl);
  }
} else {
  console.log('dev (running): no dev server, skipped');
}

// --- a server started from nothing -------------------------------------------
{
  const port = await freePort();
  const baseUrl = `http://localhost:${port}`;
  const child = spawn(
    process.execPath,
    [
      join(ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs'),
      'dev',
      '--ignore-lock',
      '--port',
      String(port),
    ],
    { cwd: ROOT, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' }, stdio: 'ignore' },
  );

  try {
    if (await waitForServer(baseUrl)) {
      await checkServer('dev (fresh)', baseUrl);
    } else {
      check('dev (fresh): the server starts', false, `no answer on ${baseUrl}`);
    }
  } finally {
    child.kill('SIGTERM');
  }
}

// --- reporting ---------------------------------------------------------------
let failed = 0;
for (const result of results) {
  if (!result.passed) failed += 1;
  console.log(
    `${result.passed ? 'ok  ' : 'FAIL'}  ${result.name}${result.detail ? `  (${result.detail})` : ''}`,
  );
}
if (failed > 0) {
  console.log('\nA dev server that cannot resolve a module is usually holding a stale graph.');
  console.log('Restart it with `npm run dev:restart` before looking for a code problem.');
}
console.log(`\n${results.length - failed}/${results.length} passed`);

process.exit(failed === 0 ? 0 : 1);
