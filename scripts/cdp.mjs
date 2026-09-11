#!/usr/bin/env node
/**
 * CDP command line for the dev app. Run with no arguments for usage.
 * Multi-step scenarios: write a .mjs that imports ./cdpClient.mjs instead of
 * chaining shell calls (one connection, event subscriptions survive).
 */
import fs from 'node:fs';
import {
  connect,
  listTargets,
  click,
  press,
  typeInto,
  selectorToExpression,
  CdpEvaluationError,
  RENDERER_PORT,
  MAIN_PORT,
  DEVTOOLS_URL_PREFIX,
} from './cdpClient.mjs';

const CHAT_INPUT_SELECTOR = '@chat-textarea';
const DEFAULT_CONSOLE_SECONDS = 1;
const ERROR_LEVELS = new Set(['error', 'assert']);
const WARNING_LEVELS = new Set(['warning', 'warn']);

const USAGE = `Usage: node scripts/cdp.mjs [--main] [--target <url|title|index>] <command> [args]

Targets
  (default)                      renderer (port ${RENDERER_PORT})
  --main                         Electron main process (port ${MAIN_PORT}, needs dev --inspect)
  --target <match>               pick a renderer window by url/title substring or index

Commands
  list                           list debuggable targets on both ports
  eval <expr>                    evaluate JS; Map/Set/DOM nodes are printed readably
  eval-file <path>               evaluate a JS file's contents (probes, helpers)
  snapshot                       document.body.innerText
  state                          window.__pigi.snapshot() (dev-only app state summary)
  console [seconds] [--all]      buffered + live console errors/warnings/exceptions (--all: every level)
  errors                         alias: console 1
  capture [path] [clipJson]      PNG screenshot, optional clip {"x","y","width","height","scale"?}
  screenshot [path]              alias of capture
  ax [path]                      accessibility tree as "role name" lines (stdout or file)
  click <selector>               real mouse click. selector: css, @testid, or text=Exact label
  type <text> [--into <sel>]     focus input (default ${CHAT_INPUT_SELECTOR}) and insert text, no submit
  send <text>                    type into chat input and press Enter
  press <combo>                  key press, e.g. Enter, Escape, Meta+k, Shift+Enter, Meta+Shift+p
  scroll <selector> <top|bottom|px>
  wait <selector> [timeoutMs]    wait until selector exists (default 10000)
`;

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--main') flags.main = true;
    else if (arg === '--all') flags.all = true;
    else if (arg === '--target' || arg === '--into') flags[arg.slice(2)] = argv[++index];
    else positional.push(arg);
  }
  return { flags, positional };
}

function print(value) {
  if (value === undefined) {
    console.log('undefined');
  } else if (typeof value === 'string') {
    console.log(value);
  } else {
    console.log(JSON.stringify(value, null, 2));
  }
}

function describeRemoteArgument(argument) {
  if (argument.value !== undefined) {
    return typeof argument.value === 'string' ? argument.value : JSON.stringify(argument.value);
  }
  if (argument.preview) {
    const properties = argument.preview.properties
      .map((property) => `${property.name}: ${property.value}`)
      .join(', ');
    return `${argument.preview.description ?? ''} {${properties}}`;
  }
  return argument.description ?? argument.type;
}

function describeStackTop(stackTrace) {
  const frame = stackTrace?.callFrames?.[0];
  if (!frame) return '';
  const url = frame.url.replace(/^https?:\/\/[^/]+/, '');
  return ` (${frame.functionName || '<anonymous>'} ${url}:${frame.lineNumber + 1}:${frame.columnNumber + 1})`;
}

async function collectConsole(session, seconds, includeAll) {
  const lines = [];
  const stop = session.onEvent((message) => {
    if (message.method === 'Runtime.consoleAPICalled') {
      const { type, args, stackTrace } = message.params;
      const isError = ERROR_LEVELS.has(type);
      const isWarning = WARNING_LEVELS.has(type);
      if (!includeAll && !isError && !isWarning) return;
      lines.push(
        `[${type}] ${args.map(describeRemoteArgument).join(' ')}${describeStackTop(stackTrace)}`,
      );
    } else if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      const text = details.exception?.description ?? details.text;
      lines.push(`[uncaught] ${text}${describeStackTop(details.stackTrace)}`);
    } else if (message.method === 'Log.entryAdded') {
      const entry = message.params.entry;
      const isError = entry.level === 'error';
      const isWarning = entry.level === 'warning';
      if (!includeAll && !isError && !isWarning) return;
      const location = entry.url ? ` (${entry.url}:${entry.lineNumber ?? 0})` : '';
      lines.push(`[${entry.source}/${entry.level}] ${entry.text}${location}`);
    }
  });
  // Runtime.enable already ran in connect(); Runtime and Log both replay their
  // buffered history on enable, so re-enable Runtime after subscribing.
  await session.call('Runtime.disable');
  await session.call('Runtime.enable');
  if (session.target === 'renderer') await session.call('Log.enable');
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  stop();
  return lines;
}

async function axTree(session) {
  await session.call('Accessibility.enable');
  const { nodes } = await session.call('Accessibility.getFullAXTree');
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const lines = [];
  const visit = (node, depth) => {
    if (!node) return;
    const role = node.role?.value;
    const name = node.name?.value;
    const skip = node.ignored || role === 'none' || role === 'generic' || role === 'InlineTextBox';
    const nextDepth = skip ? depth : depth + 1;
    if (!skip) {
      const properties = (node.properties ?? [])
        .filter((property) =>
          ['focused', 'expanded', 'selected', 'checked', 'disabled', 'pressed'].includes(
            property.name,
          ),
        )
        .map((property) => `${property.name}=${property.value.value}`)
        .join(' ');
      const value = node.value?.value ? ` value="${String(node.value.value).slice(0, 60)}"` : '';
      lines.push(
        `${'  '.repeat(depth)}${role}${name ? ` "${name.slice(0, 80)}"` : ''}${value}${properties ? ` [${properties}]` : ''}`,
      );
    }
    for (const childId of node.childIds ?? []) visit(byId.get(childId), nextDepth);
  };
  visit(nodes[0], 0);
  return lines.join('\n');
}

async function waitFor(session, selector, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const expression = `Boolean(${selectorToExpression(selector)})`;
  while (Date.now() < deadline) {
    if (await session.evaluate(expression)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const [command, ...args] = positional;

  if (!command) {
    console.log(USAGE);
    return 1;
  }

  if (command === 'list') {
    const renderer = await listTargets(RENDERER_PORT);
    const mainProcess = await listTargets(MAIN_PORT);
    for (const target of renderer) {
      if (target.url.startsWith(DEVTOOLS_URL_PREFIX)) continue;
      console.log(`renderer  ${target.type.padEnd(8)} ${target.title}  ${target.url}`);
    }
    for (const target of mainProcess) {
      console.log(`main      ${target.type.padEnd(8)} ${target.title}  ${target.url}`);
    }
    if (renderer.length === 0)
      console.log(`(no renderer on ${RENDERER_PORT}: is the dev app running?)`);
    if (mainProcess.length === 0)
      console.log(`(no main inspector on ${MAIN_PORT}: dev started without --inspect?)`);
    return 0;
  }

  const session = await connect({ target: flags.main ? 'main' : 'renderer', match: flags.target });
  try {
    switch (command) {
      case 'eval':
        print(await session.evaluate(args.join(' ')));
        break;
      case 'eval-file':
        print(await session.evaluate(fs.readFileSync(args[0], 'utf8')));
        break;
      case 'snapshot':
        print(await session.evaluate('document.body.innerText'));
        break;
      case 'state':
        print(
          await session.evaluate(
            flags.main ? 'globalThis.__pigi.snapshot()' : 'window.__pigi.snapshot()',
          ),
        );
        break;
      case 'console':
      case 'errors': {
        const seconds = Number(args[0]) || DEFAULT_CONSOLE_SECONDS;
        const lines = await collectConsole(session, seconds, flags.all);
        console.log(lines.join('\n') || '(no console output)');
        break;
      }
      case 'capture':
      case 'screenshot': {
        const path = args[0] || '/tmp/pigi-capture.png';
        const params = { format: 'png' };
        if (args[1]) {
          const clip = JSON.parse(args[1]);
          params.clip = { ...clip, scale: clip.scale ?? 2 };
          params.captureBeyondViewport = true;
        }
        const result = await session.call('Page.captureScreenshot', params);
        fs.writeFileSync(path, Buffer.from(result.data, 'base64'));
        console.log(`Saved to ${path}`);
        break;
      }
      case 'ax': {
        const tree = await axTree(session);
        if (args[0]) {
          fs.writeFileSync(args[0], tree);
          console.log(`Saved to ${args[0]}`);
        } else {
          console.log(tree);
        }
        break;
      }
      case 'click': {
        const point = await click(session, args[0]);
        console.log(`Clicked ${args[0]} at (${Math.round(point.x)}, ${Math.round(point.y)})`);
        break;
      }
      case 'type':
        await typeInto(session, flags.into ?? CHAT_INPUT_SELECTOR, args.join(' '));
        console.log(`Typed ${args.join(' ').length} chars`);
        break;
      case 'send':
        await typeInto(session, CHAT_INPUT_SELECTOR, args.join(' '));
        await press(session, 'Enter');
        console.log(`Sent: "${args.join(' ')}"`);
        break;
      case 'press':
        await press(session, args[0]);
        console.log(`Pressed ${args[0]}`);
        break;
      case 'scroll': {
        const [selector, position] = args;
        const targetExpression =
          position === 'top'
            ? '0'
            : position === 'bottom'
              ? 'el.scrollHeight'
              : String(Number(position));
        const result = await session.evaluate(`(() => {
          const el = ${selectorToExpression(selector)};
          if (!el) return null;
          el.scrollTop = ${targetExpression};
          return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
        })()`);
        if (!result) throw new Error(`Element not found: ${selector}`);
        print(result);
        break;
      }
      case 'wait': {
        const timeoutMs = Number(args[1]) || 10000;
        const found = await waitFor(session, args[0], timeoutMs);
        console.log(found ? `Found ${args[0]}` : `Timeout waiting for ${args[0]}`);
        return found ? 0 : 1;
      }
      default:
        console.log(USAGE);
        return 1;
    }
    return 0;
  } finally {
    session.close();
  }
}

try {
  process.exit(await main());
} catch (error) {
  console.error(error instanceof CdpEvaluationError ? `Error: ${error.message}` : error.message);
  process.exit(1);
}
