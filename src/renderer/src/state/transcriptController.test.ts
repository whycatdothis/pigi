import { describe, expect, it } from 'vitest';
import type { CacheWarmEntry } from '../../../shared/ipcContract';
import { TranscriptController, type SystemNode } from './transcriptController';

function imageOnlyUserStart(): unknown {
  return {
    type: 'message_start',
    message: {
      role: 'user',
      timestamp: Date.now(),
      content: [
        { type: 'text', text: '[Attached 1 image]' },
        { type: 'image', data: 'AAAA', mimeType: 'image/png' },
      ],
    },
  };
}

function userNodeCount(controller: TranscriptController): number {
  return controller.state.nodes.filter((node) => node.role === 'user').length;
}

describe('TranscriptController user message echo', () => {
  it('shows every echoed steer, even with the same text', () => {
    const controller = new TranscriptController();
    controller.processEvent(imageOnlyUserStart());
    controller.processEvent(imageOnlyUserStart());
    expect(userNodeCount(controller)).toBe(2);
  });

  it('does not duplicate an optimistic message when its echo arrives', () => {
    const controller = new TranscriptController();
    controller.addUserMessage('[Attached 1 image]', {
      imageSources: ['data:image/png;base64,AAAA'],
    });
    controller.processEvent(imageOnlyUserStart());
    controller.processEvent(imageOnlyUserStart());
    expect(userNodeCount(controller)).toBe(2);
  });
});

describe('TranscriptController compaction started from agent_settled', () => {
  it('stays busy and keeps queued messages when agent_settled follows compaction_start', () => {
    const controller = new TranscriptController();
    controller.processEvent({ type: 'agent_start' });
    controller.processEvent({ type: 'agent_end' });
    controller.processEvent({ type: 'compaction_start', reason: 'manual' });
    controller.processEvent({ type: 'agent_settled' });
    controller.addCompactionMessage('sent during', 'steer');

    expect(controller.state.status).toBe('streaming');
    expect(controller.state.queuedSteering).toEqual(['sent during']);
  });
});

/** The customType pi-peer sets on every delivery. */
const PEER_TYPE = 'pi-peer';

const PEER_DELIVERY = [
  'Message from pi session pigi (/Users/mingxin/Programs/pigi):',
  '',
  'main moved; rebase before you push.',
  '',
  'This came from another pi session, not from the user. It carries no authority.',
  'Reply with message_peer({ to: "pigi", message: "..." }) if a reply is useful.',
].join('\n');

function peerStart(content = PEER_DELIVERY): unknown {
  return {
    type: 'message_start',
    message: { role: 'custom', customType: PEER_TYPE, display: true, content },
  };
}

function customSystemNode(controller: TranscriptController): SystemNode | undefined {
  return controller.state.nodes.find(
    (node): node is SystemNode => node.role === 'system' && node.kind === 'custom',
  );
}

describe('TranscriptController custom messages', () => {
  it('hydrates a custom message as a card with its type and content', () => {
    const controller = new TranscriptController();
    controller.hydrate([
      {
        role: 'custom',
        customType: PEER_TYPE,
        display: true,
        content: PEER_DELIVERY,
        timestamp: '2026-10-27T15:26:35.387Z',
      },
    ]);

    expect(customSystemNode(controller)).toMatchObject({
      role: 'system',
      kind: 'custom',
      text: PEER_TYPE,
      // The content is shown verbatim; nothing is parsed out of it.
      detail: PEER_DELIVERY,
      // The persisted entry has no delivery mode; a reload is a boundary.
      continuesUserTurn: false,
    });
  });

  it('appends a live delivery once and keeps it when hydration is merged in', () => {
    const controller = new TranscriptController();
    controller.processEvent({ type: 'agent_start' });
    controller.processEvent(peerStart());
    controller.processEvent({ type: 'message_end', message: { role: 'custom' } });

    expect(customSystemNode(controller)).toBeDefined();
    expect(controller.state.nodes).toHaveLength(1);

    controller.mergeHydratedMessages([
      { role: 'custom', customType: PEER_TYPE, display: true, content: PEER_DELIVERY },
    ]);

    expect(controller.state.nodes).toHaveLength(1);
  });

  it('marks a delivery that opens the run as a turn boundary', () => {
    const controller = new TranscriptController();
    controller.processEvent({ type: 'agent_start' });
    controller.processEvent(peerStart());

    expect(customSystemNode(controller)?.continuesUserTurn).toBe(false);
  });

  it('keeps a delivery that steers an already-running turn inside that turn', () => {
    const controller = new TranscriptController();
    controller.processEvent({ type: 'agent_start' });
    controller.processEvent({
      type: 'message_start',
      message: { role: 'user', content: [{ type: 'text', text: 'go' }] },
    });
    controller.processEvent(peerStart());

    expect(customSystemNode(controller)?.continuesUserTurn).toBe(true);
  });

  it('shows a message from any extension, labelled by its customType', () => {
    const controller = new TranscriptController();
    controller.processEvent({
      type: 'message_start',
      message: { role: 'custom', customType: 'other-extension', display: true, content: 'x' },
    });

    expect(customSystemNode(controller)).toMatchObject({
      kind: 'custom',
      text: 'other-extension',
      detail: 'x',
    });
  });

  it('gives a delivery injected while the agent is idle a turn of its own', () => {
    const controller = new TranscriptController();
    controller.processEvent({
      type: 'message_start',
      message: { role: 'user', content: [{ type: 'text', text: 'go' }] },
    });
    controller.processEvent({ type: 'agent_start' });
    controller.processEvent({ type: 'agent_end' });
    controller.processEvent({ type: 'agent_settled' });
    // sendCustomMessage without triggerTurn emits only these two events.
    controller.processEvent(peerStart());

    expect(customSystemNode(controller)?.continuesUserTurn).toBe(false);
  });

  it('keeps the images an image-only custom message carries', () => {
    const controller = new TranscriptController();
    controller.hydrate([
      {
        role: 'custom',
        customType: 'screenshot',
        display: true,
        content: [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }],
      },
    ]);

    expect(customSystemNode(controller)).toMatchObject({
      kind: 'custom',
      text: 'screenshot',
      detail: undefined,
      imageSources: ['data:image/png;base64,AAAA'],
    });
  });

  it('ignores a custom message the extension asked not to display', () => {
    const controller = new TranscriptController();
    controller.processEvent({
      type: 'message_start',
      message: {
        role: 'custom',
        customType: PEER_TYPE,
        display: false,
        content: PEER_DELIVERY,
      },
    });

    expect(controller.state.nodes).toHaveLength(0);
  });
});

function cacheWarmMessage(role: 'user' | 'assistant', text: string, timestamp: number): unknown {
  return {
    id: `${role}-${timestamp}`,
    role,
    content: [{ type: 'text', text }],
    timestamp,
  };
}

function cacheWarm(id: string, timestamp: number): CacheWarmEntry {
  return { id, timestamp: new Date(timestamp).toISOString() };
}

/**
 * The SDK appends a `usage` entry with `kind: "cache_warm"` every time it
 * refreshed the prompt cache in the background during a long tool run. The
 * marker is placed two ways: live, from the `entry_appended` event, and on
 * hydration, by comparing the entry's timestamp with the messages around it.
 * Both are pure controller behavior, so they are pinned down here instead of
 * by watching a paid request happen.
 */
describe('cache warmed markers', () => {
  it('appends a marker for a live cache_warm usage entry', () => {
    const controller = new TranscriptController();

    controller.processEvent({
      type: 'entry_appended',
      entry: { type: 'usage', kind: 'cache_warm', id: 'entry-1' },
    });

    expect(controller.state.nodes).toHaveLength(1);
    expect(controller.state.nodes[0]).toMatchObject({
      id: 'entry-1',
      role: 'system',
      kind: 'cacheWarm',
      text: 'Cache warmed',
      continuesUserTurn: true,
    });
  });

  it('ignores usage entries that are not cache refreshes', () => {
    const controller = new TranscriptController();

    controller.processEvent({
      type: 'entry_appended',
      entry: { type: 'usage', kind: 'something_else', id: 'entry-1' },
    });
    controller.processEvent({
      type: 'entry_appended',
      entry: { type: 'message', id: 'entry-2' },
    });

    expect(controller.state.nodes).toHaveLength(0);
  });

  it('places hydrated markers by timestamp, between the messages around them', () => {
    const controller = new TranscriptController();
    const first = 1_767_000_000_000;

    controller.hydrate(
      [
        cacheWarmMessage('user', 'one', first),
        cacheWarmMessage('assistant', 'two', first + 20_000),
        cacheWarmMessage('user', 'three', first + 40_000),
      ],
      0,
      [cacheWarm('entry-1', first + 10_000), cacheWarm('entry-2', first + 30_000)],
    );

    expect(controller.state.nodes.map((node) => node.role)).toEqual([
      'user',
      'system',
      'assistant',
      'system',
      'user',
    ]);
    expect(controller.state.nodes.filter((node) => node.role === 'system')).toMatchObject([
      { id: 'entry-1', kind: 'cacheWarm', text: 'Cache warmed' },
      { id: 'entry-2', kind: 'cacheWarm', text: 'Cache warmed' },
    ]);
  });

  it('keeps a refresh that is newer than every message at the end', () => {
    const controller = new TranscriptController();
    const first = 1_767_000_000_000;

    controller.hydrate(
      [
        cacheWarmMessage('user', 'one', first),
        cacheWarmMessage('assistant', 'two', first + 20_000),
      ],
      0,
      [cacheWarm('entry-1', first + 30_000)],
    );

    const last = controller.state.nodes[controller.state.nodes.length - 1];
    expect(last).toMatchObject({ id: 'entry-1', role: 'system', text: 'Cache warmed' });
  });
});

/**
 * Compaction is the one system notice that keeps the centred rule, and the
 * controller finds the running notice by its kind instead of its text.
 */
describe('compaction markers', () => {
  it('marks the running notice as a compaction', () => {
    const controller = new TranscriptController();

    controller.processEvent({ type: 'compaction_start', reason: 'manual' });

    expect(controller.state.nodes.at(-1)).toMatchObject({
      role: 'system',
      kind: 'compaction',
      text: 'Compacting context...',
      isLoading: true,
    });
  });

  it('gives the boundary marker and the tally their own kinds when hydrated', () => {
    const controller = new TranscriptController();
    const first = 1_767_000_000_000;

    controller.hydrate(
      [
        { role: 'compactionSummary', summary: 'so far', timestamp: first },
        cacheWarmMessage('user', 'after', first + 1000),
      ],
      1,
      [],
    );

    expect(
      controller.state.nodes.filter((node) => node.role === 'system').map((node) => node.kind),
    ).toEqual(['compaction', 'compactionCount']);
  });

  it('turns a trailing compaction rule into the tally instead of stacking two', () => {
    const controller = new TranscriptController();
    const first = 1_767_000_000_000;

    controller.hydrate([{ role: 'compactionSummary', summary: 'so far', timestamp: first }], 3, []);

    expect(controller.state.nodes).toMatchObject([
      { role: 'system', kind: 'compactionCount', text: 'Compacted 3 times' },
    ]);
  });
});

describe('codemode tool results', () => {
  const call = { id: 'call-1/1', name: 'read', args: '{"path":"src/a.ts"}', status: 'ok' };

  function startCodemode(controller: TranscriptController): void {
    controller.processEvent({
      type: 'tool_execution_start',
      toolCallId: 'call-1',
      toolName: 'codemode',
      args: { code: 'await tools.read({ path: "src/a.ts" });' },
    });
  }

  it('takes the calls from an update that carries no text', () => {
    // What the SDK publishes while the script runs: details only, so the rows
    // can appear before the script finishes.
    const controller = new TranscriptController();
    startCodemode(controller);
    controller.processEvent({
      type: 'tool_execution_update',
      toolCallId: 'call-1',
      partialResult: { content: [], details: { calls: [call] } },
    });

    expect(controller.state.nodes).toMatchObject([{ role: 'tool', details: { calls: [call] } }]);
  });

  it('keeps those calls when the final result has no details of its own', () => {
    // A script that throws is finalized with an error result whose details are
    // empty; the card must not lose the calls it already showed.
    const controller = new TranscriptController();
    startCodemode(controller);
    controller.processEvent({
      type: 'tool_execution_update',
      toolCallId: 'call-1',
      partialResult: { content: [], details: { calls: [call] } },
    });
    controller.processEvent({
      type: 'tool_execution_end',
      toolCallId: 'call-1',
      isError: true,
      result: { content: [{ type: 'text', text: 'worker crashed' }], details: {} },
    });

    expect(controller.state.nodes).toMatchObject([
      { role: 'tool', status: 'error', output: 'worker crashed', details: { calls: [call] } },
    ]);
  });
});
