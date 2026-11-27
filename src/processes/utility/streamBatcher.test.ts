/**
 * What actually crosses the port. The renderer appends deltas, so the two sides
 * have to agree on when a value is a tail and when it is a replacement: sending
 * a snapshot as a delta duplicates text in a card that is still running, and
 * sending a truncation as a delta leaves stale text behind it.
 */
import { describe, expect, it } from 'vitest';
import { StreamBatcher, type Port } from './streamBatcher';

function batcherWithPort(): { batcher: StreamBatcher; sent: unknown[] } {
  const sent: unknown[] = [];
  const port: Port = {
    postMessage: (message) => sent.push(message),
    start: () => undefined,
    close: () => undefined,
    on: () => undefined,
  };
  const batcher = new StreamBatcher();
  batcher.start(port);
  return { batcher, sent };
}

describe('tool output', () => {
  it('sends the tail of a growing output, and the whole value when it shrinks from the front', () => {
    const { batcher, sent } = batcherWithPort();

    batcher.setToolOutput('call-1', 'line 1\n');
    batcher.flushNow();
    // The first snapshot is the baseline the tails are measured from.
    expect(sent).toEqual([{ type: 'stream_batch', toolOutput: { 'call-1': 'line 1\n' } }]);

    batcher.setToolOutput('call-1', 'line 1\nline 2\n');
    batcher.flushNow();
    expect(sent.at(-1)).toEqual({
      type: 'stream_batch',
      toolOutputDelta: { 'call-1': 'line 2\n' },
    });

    // bash keeps head and tail once a command passes its limits: not an
    // extension, so the renderer must replace rather than append.
    batcher.setToolOutput('call-1', 'line 1\n…\nline 9\n');
    batcher.flushNow();
    expect(sent.at(-1)).toEqual({
      type: 'stream_batch',
      toolOutput: { 'call-1': 'line 1\n…\nline 9\n' },
    });
  });

  it('keeps only the newest value per tool call in one batch', () => {
    const { batcher, sent } = batcherWithPort();

    // Nothing has been flushed, so the renderer has no baseline: the second
    // value must replace the first in the batch rather than grow a tail onto it.
    batcher.setToolOutput('call-1', 'a');
    batcher.setToolOutput('call-1', 'abc');
    batcher.flushNow();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({ type: 'stream_batch', toolOutput: { 'call-1': 'abc' } });
  });

  it('sends a whole value again after the tool it belongs to was forgotten', () => {
    const { batcher, sent } = batcherWithPort();

    batcher.setToolOutput('call-1', 'line 1\n');
    batcher.flushNow();
    // The end event carries the result; the baseline goes with it.
    batcher.forgetTool('call-1');
    batcher.setToolOutput('call-1', 'line 1\nline 2\n');
    batcher.flushNow();

    // A tail here would be appended to the final result by the renderer.
    expect(sent.at(-1)).toEqual({
      type: 'stream_batch',
      toolOutput: { 'call-1': 'line 1\nline 2\n' },
    });
  });
});

describe('write args', () => {
  it('sends the path once, then only the content that grew', () => {
    const { batcher, sent } = batcherWithPort();

    batcher.setWriteArgs('call-1', { path: '/tmp/a.ts' });
    batcher.flushNow();
    expect(sent.at(-1)).toEqual({
      type: 'stream_batch',
      toolArgs: { 'call-1': { name: 'write', args: { path: '/tmp/a.ts', content: '' } } },
    });

    batcher.setWriteArgs('call-1', { path: '/tmp/a.ts', content: 'const a' });
    batcher.setWriteArgs('call-1', { path: '/tmp/a.ts', content: 'const abc' });
    batcher.flushNow();
    expect(sent.at(-1)).toEqual({
      type: 'stream_batch',
      toolArgsContentDelta: { 'call-1': 'const abc' },
    });

    batcher.setWriteArgs('call-1', { path: '/tmp/a.ts', content: 'const abc;' });
    batcher.flushNow();
    expect(sent.at(-1)).toEqual({
      type: 'stream_batch',
      toolArgsContentDelta: { 'call-1': ';' },
    });
  });

  it('keeps the path when the content arrives in the same batch', () => {
    const { batcher, sent } = batcherWithPort();

    // The two calls land inside one 8ms window: the first value never left, so
    // a tail would reach a card that has no args (and no path) at all.
    batcher.setWriteArgs('call-1', { path: '/tmp/a.ts' });
    batcher.setWriteArgs('call-1', { path: '/tmp/a.ts', content: 'const abc' });
    batcher.flushNow();

    expect(sent).toEqual([
      {
        type: 'stream_batch',
        toolArgs: {
          'call-1': { name: 'write', args: { path: '/tmp/a.ts', content: 'const abc' } },
        },
      },
    ]);
  });

  it('sends a whole value again when the arguments are rewritten', () => {
    const { batcher, sent } = batcherWithPort();

    batcher.setWriteArgs('call-1', { path: '/tmp/a.ts', content: 'one' });
    batcher.setWriteArgs('call-1', { path: '/tmp/b.ts', content: 'two' });
    batcher.flushNow();

    expect(sent.at(-1)).toEqual({
      type: 'stream_batch',
      toolArgs: { 'call-1': { name: 'write', args: { path: '/tmp/b.ts', content: 'two' } } },
    });
  });
});

describe('forgetTool', () => {
  it('drops what a finished tool sent, so it is not held for the session', () => {
    const { batcher } = batcherWithPort();
    batcher.setToolOutput('call-1', 'a'.repeat(10_000));
    batcher.setWriteArgs('call-1', { path: '/tmp/a.ts', content: 'b'.repeat(10_000) });
    batcher.forgetTool('call-1');
    batcher.flushNow();

    const internals = batcher as unknown as { sentToolOutput: Map<string, string> };
    expect(internals.sentToolOutput.size).toBe(0);
  });
});
