/**
 * Tests for the sidebar's fork tree.
 *
 * The rules worth pinning down here are the ones a flat list cannot show: which
 * sessions nest under which, the order of a block, and the connector geometry
 * (`ancestorContinues`) the rows are drawn from.
 */
import { describe, expect, it } from 'vitest';
import type { PiSessionInfo } from '../../../shared/ipcContract';
import { buildLineage, flattenLineage, type LineageRow } from './sessionLineage';

function session(
  path: string,
  options: { parent?: string; modified?: string } = {},
): PiSessionInfo {
  const modified = options.modified ?? '2026-01-01T00:00:00.000Z';
  return {
    path,
    id: path,
    cwd: '/repo',
    parentSessionPath: options.parent,
    created: '2026-01-01T00:00:00.000Z',
    modified,
    messageCount: 0,
    firstMessage: path,
    allMessagesText: path,
  };
}

/** `path@depth`, with `!` on the last sibling, in render order. */
function outline(rows: LineageRow[]): string[] {
  return rows.map((row) => `${row.session.path}@${row.depth}${row.isLast ? '!' : ''}`);
}

describe('buildLineage', () => {
  it('nests a session under the session it was forked from', () => {
    const rows = flattenLineage(
      buildLineage([session('a'), session('b', { parent: 'a' }), session('c', { parent: 'b' })]),
    );

    expect(outline(rows)).toEqual(['a@0!', 'b@1!', 'c@2!']);
  });

  it('orders a block by its latest activity, and a fork by its own', () => {
    const lineage = buildLineage([
      session('old-parent', { modified: '2026-01-01T00:00:00.000Z' }),
      // Used yesterday: the block outranks the newer root below.
      session('old-parent/fork', { parent: 'old-parent', modified: '2026-01-05T00:00:00.000Z' }),
      session('new-root', { modified: '2026-01-03T00:00:00.000Z' }),
      session('new-root/fork', { parent: 'new-root', modified: '2026-01-02T00:00:00.000Z' }),
    ]);

    expect(outline(flattenLineage(lineage))).toEqual([
      'old-parent@0!',
      'old-parent/fork@1!',
      'new-root@0!',
      'new-root/fork@1!',
    ]);
  });

  it('treats a session whose parent is not listed as a root', () => {
    const rows = flattenLineage(buildLineage([session('b', { parent: 'elsewhere' })]));

    expect(outline(rows)).toEqual(['b@0!']);
  });

  it('keeps both sessions when two files claim each other as parent', () => {
    const rows = flattenLineage(
      buildLineage([session('a', { parent: 'b' }), session('b', { parent: 'a' })]),
    );

    expect(rows.map((row) => row.session.path).sort()).toEqual(['a', 'b']);
  });

  it('matches a Windows parent by ignoring case, and looks past it for lineage', () => {
    const rows = flattenLineage(
      buildLineage([
        session('C:\\Users\\me\\parent.jsonl'),
        session('C:\\Users\\me\\child.jsonl', { parent: 'c:\\users\\me\\PARENT.jsonl' }),
        session('C:\\Users\\me\\grandchild.jsonl', { parent: 'c:\\users\\me\\CHILD.jsonl' }),
      ]),
    );

    expect(outline(rows)).toEqual([
      'C:\\Users\\me\\parent.jsonl@0!',
      'C:\\Users\\me\\child.jsonl@1!',
      'C:\\Users\\me\\grandchild.jsonl@2!',
    ]);
  });
});

describe('flattenLineage', () => {
  /**
   * a
   * ├─ b
   * │  └─ d
   * └─ c
   */
  const rows = flattenLineage(
    buildLineage([
      session('a'),
      session('b', { parent: 'a' }),
      session('c', { parent: 'a' }),
      session('d', { parent: 'b' }),
    ]),
  );

  it('marks the last sibling of each level', () => {
    expect(outline(rows)).toEqual(['a@0!', 'b@1', 'd@2!', 'c@1!']);
  });

  it('marks a column as running on when that ancestor has a sibling below it', () => {
    const byPath = new Map(rows.map((row) => [row.session.path, row]));

    // `b` opens its own column, which closes at `b`.
    expect(byPath.get('b')?.ancestorContinues).toEqual([]);
    // `d` hangs under `b`, and `b` is not the last child of `a`, so the line
    // at `b`'s column runs past `d` down to `c`.
    expect(byPath.get('d')?.ancestorContinues).toEqual([true]);
    expect(byPath.get('c')?.ancestorContinues).toEqual([]);
  });
});
