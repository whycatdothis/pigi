// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ToolNode } from '../state/transcriptController';
import { getToolSearchText } from './toolDisplay';

/**
 * The search counts matches in this text and then highlights the n-th match in
 * the card's DOM, so the text has to list what the card shows, in that order:
 * the script, one line per nested call, then the output.
 */
describe('codemode search text', () => {
  it('follows the card: script, the calls it made, then the output', () => {
    const node: ToolNode = {
      id: 'tool-1',
      role: 'tool',
      toolCallId: 'call-1',
      name: 'codemode',
      args: { code: 'const a = await tools.read({ path: "src/a.ts" });' },
      status: 'error',
      output: [
        'Script failed\nWall time 0.3 seconds\nOutput:\n',
        'Script error:\nENOENT: no such file',
      ].join('\n'),
      isError: true,
      startedAt: 1_700_000_000_000,
      durationMs: 300,
      details: {
        calls: [
          {
            id: 'call-1/1',
            name: 'read',
            args: '{"path":"src/a.ts"}',
            status: 'error',
            durationMs: 3,
            error: 'ENOENT',
          },
        ],
      },
    };

    expect(getToolSearchText(node).split('\n')).toEqual([
      'const a = await tools.read({ path: "src/a.ts" });',
      'read src/a.ts ENOENT',
      'Script error:',
      'ENOENT: no such file',
    ]);
  });
});
