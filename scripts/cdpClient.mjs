/**
 * Shared CDP client for the dev app.
 *
 * Two endpoints exist in dev:
 *   - renderer: Chromium remote debugging on 9222 (BrowserWindow webContents)
 *   - main:     Node inspector on 9229 (Electron main process, `--inspect`)
 *
 * Usage from a script:
 *   import { connect } from './cdpClient.mjs';
 *   const session = await connect();                 // renderer
 *   const session = await connect({ target: 'main' }); // main process
 *   await session.evaluate('document.title');
 *   await session.call('Page.captureScreenshot', { format: 'png' });
 *   session.close();
 */
import http from 'node:http';

export const RENDERER_PORT = 9222;
export const MAIN_PORT = 9229;
export const DEVTOOLS_URL_PREFIX = 'devtools://';

const CONNECT_TIMEOUT_MS = 5000;
const CALL_TIMEOUT_MS = 30000;

export const MODIFIER_BITS = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };

export function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let data = '';
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

export async function listTargets(port) {
  try {
    return await httpGetJson(`http://127.0.0.1:${port}/json/list`);
  } catch {
    return [];
  }
}

function openSocket(url) {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`ws connect timeout: ${url}`)),
      CONNECT_TIMEOUT_MS,
    );
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`ws connect failed: ${url}`));
    });
  });
}

function createTransport(socket) {
  let nextId = 1;
  const pending = new Map();
  const eventHandlers = new Set();

  socket.addEventListener('message', (messageEvent) => {
    const message = JSON.parse(messageEvent.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(timer);
      if (message.error) {
        reject(new Error(`${message.error.message ?? ''} ${message.error.data ?? ''}`.trim()));
      } else {
        resolve(message.result);
      }
      return;
    }
    if (message.method) {
      for (const handler of eventHandlers) handler(message);
    }
  });

  function send(method, params = {}, sessionId = undefined, timeoutMs = CALL_TIMEOUT_MS) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      socket.send(JSON.stringify(message));
    });
  }

  return { send, eventHandlers };
}

function pickRendererTarget(targets, match) {
  const pages = targets.filter(
    (target) => target.type === 'page' && !target.url.startsWith(DEVTOOLS_URL_PREFIX),
  );
  if (match === undefined) return pages[0];
  if (/^\d+$/.test(match)) return pages[Number(match)];
  return pages.find((page) => page.url.includes(match) || page.title.includes(match));
}

/**
 * Serializer evaluated inside the target. Turns things JSON drops on the floor
 * (DOM nodes, Map, Set, Error, functions, cycles) into readable values so
 * `eval` output is never a silent `{}`.
 */
const SERIALIZE_FUNCTION = `function () {
  const seen = new WeakSet();
  const describeNode = (node) => {
    if (node.nodeType !== 1) return '[' + node.nodeName + ']';
    const testId = node.dataset && node.dataset.testid ? ' @' + node.dataset.testid : '';
    const id = node.id ? '#' + node.id : '';
    const cls = node.classList && node.classList.length
      ? '.' + Array.from(node.classList).slice(0, 3).join('.')
      : '';
    return '[' + node.tagName.toLowerCase() + id + cls + testId + ']';
  };
  const replacer = (key, value) => {
    if (typeof value === 'function') return '[Function ' + (value.name || 'anonymous') + ']';
    if (typeof value === 'bigint') return value.toString() + 'n';
    if (typeof value === 'symbol') return value.toString();
    if (value === undefined) return '[undefined]';
    if (value === null || typeof value !== 'object') return value;
    if (typeof Node !== 'undefined' && value instanceof Node) return describeNode(value);
    if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
    if (value instanceof Map) return { '[Map]': Object.fromEntries(value) };
    if (value instanceof Set) return { '[Set]': Array.from(value) };
    if (value instanceof Date) return value.toISOString();
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    return value;
  };
  return JSON.stringify(this, replacer);
}`;

function formatException(exceptionDetails) {
  const exception = exceptionDetails.exception;
  if (exception?.description) return exception.description;
  const location = exceptionDetails.url
    ? ` (${exceptionDetails.url}:${exceptionDetails.lineNumber}:${exceptionDetails.columnNumber})`
    : '';
  return `${exceptionDetails.text}${location}`;
}

export class CdpEvaluationError extends Error {}

/**
 * @param {{ target?: 'renderer' | 'main', match?: string }} options
 *   target: which process to attach to. match: renderer page url/title substring
 *   or zero-based index when several windows exist.
 */
export async function connect({ target = 'renderer', match } = {}) {
  let socket;
  let sessionId;
  let page;

  if (target === 'main') {
    const targets = await listTargets(MAIN_PORT);
    const node = targets.find((candidate) => candidate.type === 'node');
    if (!node) {
      throw new Error(
        `No main-process inspector on port ${MAIN_PORT}. Start dev with \`npm run dev\` (passes --inspect).`,
      );
    }
    socket = await openSocket(node.webSocketDebuggerUrl);
  } else {
    page = pickRendererTarget(await listTargets(RENDERER_PORT), match);
    if (!page) {
      throw new Error(`No renderer page target on port ${RENDERER_PORT}. Is the dev app running?`);
    }
    const version = await httpGetJson(`http://127.0.0.1:${RENDERER_PORT}/json/version`);
    socket = await openSocket(version.webSocketDebuggerUrl);
  }

  const transport = createTransport(socket);
  const call = (method, params = {}, timeoutMs) =>
    transport.send(method, params, sessionId, timeoutMs);

  if (page) {
    ({ sessionId } = await transport.send('Target.attachToTarget', {
      targetId: page.id,
      flatten: true,
    }));
  }

  await call('Runtime.enable');

  /**
   * Evaluate and return a JS value. Objects are serialized in-page with
   * Map/Set/DOM-node awareness. Throws CdpEvaluationError on exceptions.
   */
  async function evaluate(expression, { raw = false } = {}) {
    const result = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: raw,
    });
    if (result.exceptionDetails) {
      throw new CdpEvaluationError(formatException(result.exceptionDetails));
    }
    const remote = result.result;
    if (remote.type === 'undefined') return undefined;
    if (remote.subtype === 'null') return null;
    if (raw || !remote.objectId) {
      return remote.value !== undefined ? remote.value : remote.description;
    }
    const serialized = await call('Runtime.callFunctionOn', {
      objectId: remote.objectId,
      functionDeclaration: SERIALIZE_FUNCTION,
      returnByValue: true,
    });
    if (serialized.exceptionDetails) {
      throw new CdpEvaluationError(formatException(serialized.exceptionDetails));
    }
    await call('Runtime.releaseObject', { objectId: remote.objectId }).catch(() => {});
    return serialized.result.value === undefined ? undefined : JSON.parse(serialized.result.value);
  }

  return {
    target,
    sessionId,
    call,
    evaluate,
    onEvent(handler) {
      transport.eventHandlers.add(handler);
      return () => transport.eventHandlers.delete(handler);
    },
    close() {
      socket.close();
    },
  };
}

/** Resolve a selector argument: `@foo` means `[data-testid="foo"]`, `text=Foo` matches visible text. */
export function selectorToExpression(selector) {
  if (selector.startsWith('@')) {
    return `document.querySelector(${JSON.stringify(`[data-testid="${selector.slice(1)}"]`)})`;
  }
  if (selector.startsWith('text=')) {
    const needle = JSON.stringify(selector.slice('text='.length));
    return `Array.from(document.querySelectorAll('button, a, [role], li, span, div, label'))
      .filter((el) => el.checkVisibility && el.checkVisibility())
      .find((el) => el.children.length === 0 && el.textContent.trim() === ${needle})
      ?? Array.from(document.querySelectorAll('*')).find((el) => el.children.length === 0 && el.textContent.trim() === ${needle})`;
  }
  return `document.querySelector(${JSON.stringify(selector)})`;
}

const CENTER_EXPRESSION = (selector) => `(() => {
  const el = ${selectorToExpression(selector)};
  if (!el) return null;
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height };
})()`;

/** Real mouse click (move, press, release) at the element center. */
export async function click(session, selector) {
  const point = await session.evaluate(CENTER_EXPRESSION(selector));
  if (!point) throw new Error(`Element not found: ${selector}`);
  if (point.width === 0 && point.height === 0) throw new Error(`Element has no box: ${selector}`);
  const { x, y } = point;
  await session.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await session.call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await session.call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  return point;
}

const SPECIAL_KEYS = {
  Enter: { code: 'Enter', keyCode: 13, text: '\r' },
  Tab: { code: 'Tab', keyCode: 9 },
  Escape: { code: 'Escape', keyCode: 27 },
  Backspace: { code: 'Backspace', keyCode: 8 },
  Delete: { code: 'Delete', keyCode: 46 },
  Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 },
  ArrowDown: { code: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { code: 'ArrowRight', keyCode: 39 },
  Home: { code: 'Home', keyCode: 36 },
  End: { code: 'End', keyCode: 35 },
  PageUp: { code: 'PageUp', keyCode: 33 },
  PageDown: { code: 'PageDown', keyCode: 34 },
};

const MODIFIER_ALIASES = {
  cmd: 'Meta',
  command: 'Meta',
  meta: 'Meta',
  ctrl: 'Control',
  control: 'Control',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
};

/** Parse "Meta+Shift+k" into dispatchKeyEvent params. */
export function parseKeyCombo(combo) {
  const parts = combo.split('+').filter(Boolean);
  const keyName = parts.pop();
  let modifiers = 0;
  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part.toLowerCase()];
    if (!modifier) throw new Error(`Unknown modifier: ${part}`);
    modifiers |= MODIFIER_BITS[modifier];
  }
  const special = SPECIAL_KEYS[keyName];
  if (special) {
    return {
      key: special.key ?? keyName,
      code: special.code,
      keyCode: special.keyCode,
      text: special.text,
      modifiers,
    };
  }
  if (keyName.length !== 1) throw new Error(`Unknown key: ${keyName}`);
  const upper = keyName.toUpperCase();
  const isLetter = /[A-Z]/.test(upper);
  const shifted = (modifiers & MODIFIER_BITS.Shift) !== 0;
  const key = isLetter ? (shifted ? upper : keyName.toLowerCase()) : keyName;
  const code = isLetter ? `Key${upper}` : /[0-9]/.test(keyName) ? `Digit${keyName}` : undefined;
  const hasCommandModifier =
    (modifiers & (MODIFIER_BITS.Meta | MODIFIER_BITS.Control | MODIFIER_BITS.Alt)) !== 0;
  return {
    key,
    code,
    keyCode: upper.charCodeAt(0),
    text: hasCommandModifier ? undefined : key,
    modifiers,
  };
}

export async function press(session, combo) {
  const { key, code, keyCode, text, modifiers } = parseKeyCombo(combo);
  const base = {
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    modifiers,
  };
  await session.call('Input.dispatchKeyEvent', {
    ...base,
    type: text ? 'keyDown' : 'rawKeyDown',
    ...(text ? { text, unmodifiedText: text } : {}),
  });
  await session.call('Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
}

/** Focus an element (by real click) and insert text as one IME-style commit. */
export async function typeInto(session, selector, text) {
  await click(session, selector);
  await session.call('Input.insertText', { text });
}
