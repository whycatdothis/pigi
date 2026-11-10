import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
// The card's height is what the estimate stands in for, and only a real layout
// knows it: the wells' borders and padding, the gaps, the clamp's button.
import '../../assets/main.css';
import ToolBlock from './ToolBlock';
import { estimateRenderItemHeight } from '../../lib/messageListEstimates';
import { requireElement } from '../../testing/domQuery';
import type { ToolNode } from '../../state/transcriptController';

const SCRIPT_WITH_CALLS = Array.from(
  { length: 26 },
  (_, index) => `const row${index} = await tools.read({ path: "src/f${index}.ts" });`,
).join('\n');

function codemodeNode(overrides: Partial<ToolNode>): ToolNode {
  return {
    id: 'tool-1',
    role: 'tool',
    toolCallId: 'call-1',
    name: 'codemode',
    args: { code: 'text(await tools.read({ path: "src/a.ts" }));' },
    status: 'success',
    output: '',
    isError: false,
    startedAt: 1_700_000_000_000,
    durationMs: 210,
    ...overrides,
  };
}

async function measuredCard(node: ToolNode): Promise<{ actual: number; estimate: number }> {
  const view = await render(<ToolBlock node={node} />);
  const card = requireElement('[data-testid^="tool-block-"]', view.container);
  return {
    actual: card.getBoundingClientRect().height,
    estimate: estimateRenderItemHeight({ type: 'node', node, id: node.id }),
  };
}

/**
 * The estimate keeps unmeasured rows from jumping when they scroll in, and the
 * comment above it is explicit that under-estimating is the failure mode to
 * avoid. The card is built from wells and rows rather than one run of mono
 * lines, so every border, gap and caption has to be in the number.
 */
test('the codemode estimate covers the card it stands in for', async () => {
  const { actual, estimate } = await measuredCard(
    codemodeNode({
      args: { code: SCRIPT_WITH_CALLS },
      output: [
        'Script completed\nWall time 0.4 seconds\nOutput:\n',
        'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten',
      ].join('\n'),
      details: {
        calls: [
          {
            id: 'call-1/1',
            name: 'read',
            args: '{"path":"src/f0.ts"}',
            status: 'ok',
            durationMs: 4,
          },
          {
            id: 'call-1/2',
            name: 'read',
            args: '{"path":"src/f1.ts"}',
            status: 'ok',
            durationMs: 5,
          },
          {
            id: 'call-1/3',
            name: 'bash',
            args: '{"command":"ls"}',
            status: 'error',
            durationMs: 9,
            error: 'ENOENT: no such file or directory',
          },
        ],
      },
    }),
  );

  expect(actual).toBeGreaterThan(400);
  // Never under, and no more than one line of slack over.
  expect(estimate).toBeGreaterThanOrEqual(actual);
  expect(estimate - actual).toBeLessThanOrEqual(24);
});

test('a short script with one call is estimated without the clamp chrome', async () => {
  const { actual, estimate } = await measuredCard(
    codemodeNode({
      output: 'Script completed\nWall time 0.2 seconds\nOutput:\n\nok',
      details: {
        calls: [
          {
            id: 'call-1/1',
            name: 'read',
            args: '{"path":"src/a.ts"}',
            status: 'ok',
            durationMs: 3,
          },
        ],
      },
    }),
  );

  expect(actual).toBeGreaterThan(120);
  // Never under, and no more than one line of slack over.
  expect(estimate).toBeGreaterThanOrEqual(actual);
  expect(estimate - actual).toBeLessThanOrEqual(24);
});
