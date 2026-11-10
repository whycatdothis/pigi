// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import '../../testing/jsdomSetup';
import ToolBlock from './ToolBlock';
import { cleanToolOutput } from '../../lib/toolDisplay';
import type { ToolNode } from '../../state/transcriptController';

afterEach(cleanup);

function toolNode(overrides: Partial<ToolNode>): ToolNode {
  return {
    id: 'tool-1',
    role: 'tool',
    toolCallId: 'call-1',
    name: 'grep',
    args: { pattern: 'needle', path: 'src' },
    status: 'success',
    output: '',
    isError: false,
    startedAt: 1_700_000_000_000,
    durationMs: 12,
    ...overrides,
  };
}

/** The title row is the block's first child; its classes carry the gap rule. */
function renderTitleRowClass(node: ToolNode): string {
  const { container } = render(<ToolBlock node={node} />);
  const block = container.querySelector('[data-testid^="tool-block-"]');
  if (!block) throw new Error('tool block did not render');
  return block.children[0].className;
}

/**
 * One gap between the title and whatever follows, and the same gap from the body
 * to the status bar. Without a body there is nothing to separate, so the title
 * drops its bottom padding instead of leaving the bar one gap away and the title
 * two — that asymmetry is what this pins.
 */
test('a tool block with output pays the title gap once', () => {
  const titleClassName = renderTitleRowClass(toolNode({ output: 'src/a.ts:12: needle' }));
  expect(titleClassName).toContain('pb-1.5');
});

test('a finished tool block with no output has no gap to fill', () => {
  const titleClassName = renderTitleRowClass(toolNode({ output: '' }));
  expect(titleClassName).toContain('pb-0');
});

test('a running tool block counts its skeleton as a body', () => {
  const titleClassName = renderTitleRowClass(
    toolNode({ name: 'bash', args: { command: 'ls' }, status: 'running', output: '' }),
  );
  expect(titleClassName).toContain('pb-1.5');
});

/**
 * The codemode card has to say what the script did without the model in the
 * loop: the script it ran, the calls it made inside the sandbox, and what it
 * printed — the SDK's `Script completed … Output:` header would only repeat
 * what the card's own rows say.
 *
 * The result arrives as two content items, the header and the output, which
 * the transcript joins with a newline; that join is what leaves the blank line
 * the strip has to take with the header.
 */
const CODEMODE_OUTPUT = [
  'Script completed\nWall time 0.4 seconds\nOutput:\n',
  'two files read',
].join('\n');

function codemodeNode(overrides: Partial<ToolNode> = {}): ToolNode {
  return toolNode({
    name: 'codemode',
    args: {
      code: [
        'const [a, b] = await Promise.all([',
        '  tools.read({ path: "src/a.ts", limit: 20 }),',
        '  tools.read({ path: "src/b.ts", limit: 20 }),',
        ']);',
        'text(a + b);',
      ].join('\n'),
    },
    output: CODEMODE_OUTPUT,
    details: {
      calls: [
        {
          id: 'call-1/1',
          name: 'read',
          args: '{"path":"src/a.ts","limit":20}',
          status: 'ok',
          durationMs: 12,
        },
        {
          id: 'call-1/2',
          name: 'read',
          args: '{"path":"src/b.ts","limit":20}',
          status: 'ok',
          durationMs: 9,
        },
        {
          id: 'call-1/3',
          name: 'bash',
          args: '{"command":"ls"}',
          status: 'error',
          durationMs: 1200,
          error: 'exit code 1',
        },
      ],
    },
    ...overrides,
  });
}

test('a codemode card shows the script, its nested calls and the stripped output', () => {
  const { container } = render(<ToolBlock node={codemodeNode()} />);

  const block = container.querySelector('[data-testid^="tool-block-"]');
  if (!block) throw new Error('tool block did not render');
  expect(block.textContent).toContain('read ×2, bash');
  expect(block.textContent).toContain('src/a.ts:1-20');
  expect(block.textContent).toContain('$ ls');
  expect(block.textContent).toContain('12ms');
  expect(block.textContent).toContain('1.2s');
  expect(block.textContent).toContain('exit code 1');
  expect(block.textContent).toContain('two files read');
  expect(block.textContent).not.toContain('Script completed');
});

test('stripping the header takes the blank line it leaves behind', () => {
  const controllerNode = codemodeNode();
  expect(cleanToolOutput(controllerNode)).toBe('two files read');
});

test('a failed script keeps its error after the header is stripped', () => {
  const { container } = render(
    <ToolBlock
      node={codemodeNode({
        status: 'error',
        output: [
          'Script failed\nWall time 0.1 seconds\nOutput:\n',
          'Script error:\nENOENT: no such file',
        ].join('\n'),
      })}
    />,
  );

  const block = container.querySelector('[data-testid^="tool-block-"]');
  if (!block) throw new Error('tool block did not render');
  expect(block.textContent).toContain('Script error:');
  expect(block.textContent).not.toContain('Wall time');
});

/** The SDK cuts nested arguments at 200 characters, so this call never parses. */
test('a nested call with truncated arguments still names its tool', () => {
  const { container } = render(
    <ToolBlock
      node={codemodeNode({
        details: {
          calls: [
            {
              id: 'call-1/1',
              name: 'write',
              args: `{"path":"src/a.ts","content":"${'x'.repeat(200)}`,
              status: 'ok',
              durationMs: 3,
            },
          ],
        },
      })}
    />,
  );

  const block = container.querySelector('[data-testid^="tool-block-"]');
  if (!block) throw new Error('tool block did not render');
  expect(block.textContent).toContain('write');
  expect(block.textContent).not.toContain('{"path"');
});
