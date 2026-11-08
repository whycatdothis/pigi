/**
 * Tests for the sidebar's fork tree.
 *
 * The rules worth pinning down here are the ones a flat list cannot show: which
 * sessions nest under which, the order of a block, and the connector geometry
 * (`ancestorContinues`) the rows are drawn from.
 */
import { describe, expect, it } from 'vitest';
import type { PiSessionInfo } from '../../../shared/ipcContract';
import {
  buildLineage,
  flattenLineage,
  rowsOfFirstRoots,
  revealPath,
  type LineageRow,
} from './sessionLineage';

function session(
  path: string,
  options: { parent?: string; modified?: string; subagent?: boolean } = {},
): PiSessionInfo {
  const modified = options.modified ?? '2026-01-01T00:00:00.000Z';
  return {
    path,
    id: path,
    cwd: '/repo',
    parentSessionPath: options.parent,
    isSubagent: options.subagent,
    created: '2026-01-01T00:00:00.000Z',
    modified,
    messageCount: 0,
    firstMessage: path,
    allMessagesText: path,
  };
}

/**
 * `path@depth`, with `!` on the last sibling, in render order; a subagent group
 * is `[n subagents of parent]`.
 */
function outline(rows: LineageRow[]): string[] {
  return rows.map((row) => {
    const label =
      row.kind === 'session'
        ? row.session.path
        : `[${row.sessions.length} subagents of ${row.parentPath}]`;
    return `${label}@${row.depth}${row.isLast ? '!' : ''}`;
  });
}

function sessionPaths(rows: LineageRow[]): string[] {
  return rows.flatMap((row) => (row.kind === 'session' ? [row.session.path] : []));
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

    expect(sessionPaths(rows).sort()).toEqual(['a', 'b']);
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
    const byPath = new Map(
      rows.flatMap((row) => (row.kind === 'session' ? [[row.session.path, row] as const] : [])),
    );

    // `b` opens its own column, which closes at `b`.
    expect(byPath.get('b')?.ancestorContinues).toEqual([]);
    // `d` hangs under `b`, and `b` is not the last child of `a`, so the line
    // at `b`'s column runs past `d` down to `c`.
    expect(byPath.get('d')?.ancestorContinues).toEqual([true]);
    expect(byPath.get('c')?.ancestorContinues).toEqual([]);
  });
});

describe('subagent groups', () => {
  const sessions = [
    session('a', { modified: '2026-01-01T00:00:00.000Z' }),
    // Newer than the fork, still placed after the group.
    session('fork', { parent: 'a', modified: '2026-01-02T00:00:00.000Z' }),
    session('review', { parent: 'a', subagent: true, modified: '2026-01-03T00:00:00.000Z' }),
    session('tests', { parent: 'a', subagent: true, modified: '2026-01-04T00:00:00.000Z' }),
    session('review/fork', { parent: 'review', modified: '2026-01-05T00:00:00.000Z' }),
  ];

  it('places the group first under its parent, collapsed to one row', () => {
    const rows = flattenLineage(buildLineage(sessions));

    expect(outline(rows)).toEqual(['a@0!', '[3 subagents of a]@1', 'fork@1!']);
  });

  it('lists the subagents, newest first, under an expanded group', () => {
    const rows = flattenLineage(buildLineage(sessions), new Set(['a']));

    expect(outline(rows)).toEqual([
      'a@0!',
      '[3 subagents of a]@1',
      'review@2',
      'review/fork@3!',
      'tests@2!',
      'fork@1!',
    ]);
    // The group's column runs on past its sessions down to `fork`.
    const tests = rows.find((row) => row.kind === 'session' && row.session.path === 'tests');
    expect(tests?.ancestorContinues).toEqual([true]);
  });

  it('keeps a fork of a subagent a fork, nested under that subagent', () => {
    const rows = flattenLineage(buildLineage(sessions), new Set(['a']));
    const fork = rows.find((row) => row.kind === 'session' && row.session.path === 'review/fork');

    expect(fork?.kind === 'session' && fork.session.isSubagent).toBeFalsy();
    expect(fork?.depth).toBe(3);
  });

  it('names the ancestors and groups to open for a hidden session', () => {
    // A fork of a subagent is an ordinary session and may have subagents.
    const nested = [
      ...sessions,
      session('review/fork/check', { parent: 'review/fork', subagent: true }),
    ];

    expect(revealPath(buildLineage(nested), 'review/fork/check')).toEqual({
      ancestors: ['a', 'review', 'review/fork'],
      subagentGroups: ['a', 'review/fork'],
    });
    expect(revealPath(buildLineage(nested), 'fork')).toEqual({
      ancestors: ['a'],
      subagentGroups: [],
    });
  });
});

describe('collapsed sessions', () => {
  const sessions = [
    session('a'),
    session('a/fork', { parent: 'a' }),
    session('a/fork/fork', { parent: 'a/fork' }),
    session('a/review', { parent: 'a', subagent: true }),
    session('b'),
  ];

  it('hides the forks and the subagent group of a collapsed session', () => {
    const rows = flattenLineage(buildLineage(sessions), new Set(['a']), new Set(['a']));

    expect(sessionPaths(rows)).toEqual(['a', 'b']);
    expect(rows[0]).toMatchObject({ hasChildren: true, collapsed: true });
  });

  it('collapses a fork on its own, and only a session that has children', () => {
    const rows = flattenLineage(buildLineage(sessions), new Set(), new Set(['a/fork', 'b']));

    expect(outline(rows)).toEqual(['a@0!', '[1 subagents of a]@1', 'a/fork@1!', 'b@0!']);
    const b = rows.find((row) => row.kind === 'session' && row.session.path === 'b');
    expect(b).toMatchObject({ hasChildren: false, collapsed: false });
  });
});

describe('rowsOfFirstRoots', () => {
  it('counts roots only, keeping every row nested under them', () => {
    const rows = flattenLineage(
      buildLineage([
        session('a', { modified: '2026-01-03T00:00:00.000Z' }),
        session('a/fork', { parent: 'a', modified: '2026-01-03T00:00:00.000Z' }),
        session('a/review', { parent: 'a', subagent: true }),
        session('b', { modified: '2026-01-02T00:00:00.000Z' }),
        session('c', { modified: '2026-01-01T00:00:00.000Z' }),
      ]),
    );

    expect(outline(rows.slice(0, rowsOfFirstRoots(rows, 2)))).toEqual([
      'a@0!',
      '[1 subagents of a]@1',
      'a/fork@1!',
      'b@0!',
    ]);
    expect(rowsOfFirstRoots(rows, 5)).toBe(rows.length);
  });
});
