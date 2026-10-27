// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import '../../testing/jsdomSetup';
import ToolBlock from './ToolBlock';
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
