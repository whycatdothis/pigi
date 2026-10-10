/**
 * Tests for the renderer's session tree data: filtering, the shape rows are
 * indented into, and the two pieces of bookkeeping the navigation flow needs
 * (how much a move abandons, and which forks a row hangs from).
 *
 * These are the rules that were iterated on by hand in the running app; they are
 * pure functions over the tree the utility process sends, so they can be pinned
 * down here instead.
 */
import { describe, expect, it } from 'vitest';
import type { SessionTree, SessionTreeEntry } from '../../../shared/ipcContract';
import {
  SESSION_TREE_ROOT_ID,
  buildSessionTreeRows,
  collectBranchOwners,
  collectPathOwners,
  createSessionTreeData,
  describeSessionTreeEntry,
  type SessionTreeData,
  type SessionTreeKind,
  type SessionTreeRows,
} from './sessionTreeData';
import { countAbandonedEntries } from './sessionTreeLayout';

const TIMESTAMP = 1_767_000_000_000;

function entry(
  id: string,
  parentId: string | null,
  kind: SessionTreeKind,
  preview = '',
  extra: Partial<SessionTreeEntry> = {},
): SessionTreeEntry {
  return { id, parentId, timestamp: TIMESTAMP, kind, preview, ...extra };
}

function sessionTree(entries: SessionTreeEntry[], leafId: string | null): SessionTree {
  return { leafId, entries };
}

/**
 * A chain with one fork in the middle:
 *
 *   h1 ─ a1 ─ b1 ─┬─ c1 ─ d1
 *                 └─ e1
 */
function forkFixture(): SessionTree {
  return sessionTree(
    [
      entry('h1', null, 'user', 'start'),
      entry('a1', 'h1', 'assistant', 'answer'),
      entry('b1', 'a1', 'user', 'run it'),
      entry('c1', 'b1', 'assistant', 'first try'),
      entry('d1', 'c1', 'assistant', 'done'),
      entry('e1', 'b1', 'assistant', 'second try'),
    ],
    'd1',
  );
}

/** Every row the data holds, in session order. */
function nodeIds(tree: SessionTree, data: SessionTreeData): string[] {
  return tree.entries.map((item) => item.id).filter((id) => data.getItem(id) !== undefined);
}

const NONE: ReadonlySet<string> = new Set();

describe('createSessionTreeData', () => {
  it('keeps the rows in session order and hangs them off one root', () => {
    const tree = forkFixture();
    const data = createSessionTreeData(tree);

    expect(nodeIds(tree, data)).toEqual(['h1', 'a1', 'b1', 'c1', 'd1', 'e1']);
    expect(data.rootIds).toEqual(['h1']);
    expect(data.getItem('h1')?.parentId).toBe(SESSION_TREE_ROOT_ID);
    expect(data.getItem('c1')?.parentId).toBe('b1');
    expect(data.itemCount).toBe(6);
    expect(data.currentRootId).toBe('h1');
    expect(data.isFiltered).toBe(false);
    expect(data.rootStatsById.get('h1')?.rowCount).toBe(6);
  });

  it('drops rows of other kinds and re-attaches their children, heads included', () => {
    const tree = forkFixture();
    const data = createSessionTreeData(tree, {
      kinds: new Set<SessionTreeKind>(['assistant']),
    });

    expect(nodeIds(tree, data)).toEqual(['a1', 'c1', 'd1', 'e1']);
    // The rows a kept row hung from are gone, so it moves up to the nearest kept
    // one — and to the root rather than being left orphaned.
    expect(data.getItem('c1')?.parentId).toBe('a1');
    expect(data.getItem('a1')?.parentId).toBe(SESSION_TREE_ROOT_ID);
    expect(data.rootIds).toEqual(['a1']);
    expect(data.itemCount).toBe(4);
    expect(data.isFiltered).toBe(true);
  });

  it('keeps the ancestors of a match, and only matches get highlight indexes', () => {
    const tree = forkFixture();
    const data = createSessionTreeData(tree, { query: 'done' });

    expect(nodeIds(tree, data)).toEqual(['h1', 'a1', 'b1', 'c1', 'd1']);
    expect(data.matchIndexesById.size).toBe(1);
    expect(data.matchIndexesById.get('d1')).toEqual([0, 1, 2, 3]);
    expect(data.matchIndexesById.has('c1')).toBe(false);
  });

  it('matches tool rows on their command, with indexes into the printed text', () => {
    const data = createSessionTreeData(
      sessionTree(
        [
          entry('u1', null, 'user', 'run it'),
          entry('t1', 'u1', 'toolResult', 'hi', {
            toolName: 'bash',
            toolArgs: { command: 'echo hi' },
          }),
        ],
        't1',
      ),
      { query: 'echo' },
    );

    // The label ("bash") is not printed, so the indexes skip it.
    const toolRow = data.getItem('t1');
    expect(toolRow && describeSessionTreeEntry(toolRow.entry).text).toBe('$ echo hi · hi');
    expect(data.matchIndexesById.get('t1')).toEqual([2, 3, 4, 5]);
  });

  it('numbers the trees by the session, not by what survived the filter', () => {
    const data = createSessionTreeData(
      sessionTree(
        [
          entry('h1', null, 'user', 'first tree'),
          entry('a1', 'h1', 'assistant', 'answer'),
          entry('h2', null, 'user', 'second tree'),
          entry('a2', 'h2', 'assistant', 'answer'),
        ],
        'a2',
      ),
      { kinds: new Set<SessionTreeKind>(['user']) },
    );

    expect(data.treeIds).toEqual(['h1', 'h2']);
    expect(data.rootIds).toEqual(['h1', 'h2']);
    // Every row of the second tree was filtered away, and the tree still has a
    // header with its own number.
    expect(data.treeRootIdByItemId.get('a2')).toBe('h2');

    const assistants = createSessionTreeData(
      sessionTree(
        [
          entry('h1', null, 'user', 'first tree'),
          entry('a1', 'h1', 'assistant', 'answer'),
          entry('h2', null, 'user', 'second tree'),
          entry('a2', 'h2', 'assistant', 'answer'),
        ],
        'a2',
      ),
      { kinds: new Set<SessionTreeKind>(['assistant']) },
    );

    expect(assistants.treeIds).toEqual(['h1', 'h2']);
    expect(assistants.treeRootIdByItemId.get('a1')).toBe('h1');
    expect(assistants.treeRootIdByItemId.get('a2')).toBe('h2');
  });
});

describe('buildSessionTreeRows', () => {
  function rowsOf(
    tree: SessionTree,
    folded: ReadonlySet<string> = NONE,
    collapsedTrees: ReadonlySet<string> = NONE,
  ): SessionTreeRows & { data: SessionTreeData } {
    const data = createSessionTreeData(tree);
    return { data, ...buildSessionTreeRows(data, folded, collapsedTrees) };
  }

  it('lists the rows in the order they draw, with their indent and their branch', () => {
    const { rows, depthById, parentById } = rowsOf(forkFixture());

    // `d1` continues `c1` at the same indent: a lone child does not step in.
    expect(rows).toEqual([
      { itemId: 'h1', depth: 0, isBranchChild: false },
      { itemId: 'a1', depth: 0, isBranchChild: false },
      { itemId: 'b1', depth: 0, isBranchChild: false },
      { itemId: 'c1', depth: 1, isBranchChild: true },
      { itemId: 'd1', depth: 1, isBranchChild: false },
      { itemId: 'e1', depth: 1, isBranchChild: true },
    ]);
    expect(depthById.get('d1')).toBe(1);
    expect(parentById.get('d1')).toBe('c1');
    expect(parentById.get('e1')).toBe('b1');
    expect(parentById.has('h1')).toBe(false);
  });

  it('nests a fork inside a fork', () => {
    const { rows } = rowsOf(nestedForkFixture());

    expect(rows.map((row) => [row.itemId, row.depth])).toEqual([
      ['f1', 0],
      ['g1', 1],
      ['i1', 2],
      ['i2', 2],
      ['h1', 1],
    ]);
  });

  it('keeps a folded row and leaves out everything under it', () => {
    const { rows, depthById } = rowsOf(forkFixture(), new Set(['c1']));

    expect(rows.map((row) => row.itemId)).toEqual(['h1', 'a1', 'b1', 'c1', 'e1']);
    expect(depthById.has('d1')).toBe(false);
  });

  it('leaves out the rows of a collapsed tree', () => {
    const tree = sessionTree(
      [...forkFixture().entries, entry('h2', null, 'user', 'second tree')],
      'h2',
    );
    const { rows } = rowsOf(tree, NONE, new Set(['h1']));

    expect(rows.map((row) => row.itemId)).toEqual(['h2']);
  });

  it('names the row the path enters each level through', () => {
    const { data, parentById, depthById } = rowsOf(forkFixture());

    // The leaf sits under `c1`, so `c1` is the row the path enters the fork's
    // level through: the fork turns in there and its sibling is not on the way.
    expect([...collectPathOwners('d1', parentById, depthById)]).toEqual([[1, 'c1']]);

    // The other branch: the path enters at `e1`. What that means for the lines —
    // which run lights, which sibling is passed — is `collectRailSpans`.
    expect([...collectPathOwners('e1', parentById, depthById)]).toEqual([[1, 'e1']]);

    // A row with no fork above it owns no line at all.
    expect([...collectPathOwners('a1', parentById, depthById)]).toEqual([]);
    expect(data.activePathIds.has('d1')).toBe(true);
  });
});

/**
 * A fork inside a fork, to tell a branch's own end from the end of the tree:
 *
 *   f1 ─┬─ g1 ─┬─ i1
 *       │      └─ i2
 *       └─ h1
 */
function nestedForkFixture(): SessionTree {
  return sessionTree(
    [
      entry('f1', null, 'user', 'start'),
      entry('g1', 'f1', 'assistant', 'try one'),
      entry('i1', 'g1', 'assistant', 'one a'),
      entry('i2', 'g1', 'assistant', 'one b'),
      entry('h1', 'f1', 'assistant', 'try two'),
    ],
    'i2',
  );
}

describe('countAbandonedEntries', () => {
  const tree = forkFixture();

  it('counts the rows between the leaf and a row on another branch', () => {
    expect(countAbandonedEntries(tree, 'e1')).toBe(2);
  });

  it('counts the rows a move to an ancestor leaves behind, and nothing for a descendant', () => {
    // From the leaf `d1`: up to `b1` abandons `d1` and `c1`, up to `c1` only `d1`.
    expect(countAbandonedEntries(tree, 'b1')).toBe(2);
    expect(countAbandonedEntries(tree, 'c1')).toBe(1);
    expect(countAbandonedEntries(tree, 'd1')).toBe(0);
  });

  it('counts the whole path when the target is in another tree', () => {
    const other = { ...tree, entries: [...tree.entries, entry('h2', null, 'user', 'new tree')] };

    // The whole active path: h1, a1, b1, c1, d1.
    expect(countAbandonedEntries(other, 'h2')).toBe(5);
  });
});

describe('collectBranchOwners', () => {
  it('names the forks above a row, and nothing for a plain chain', () => {
    const data = createSessionTreeData(forkFixture());
    const { parentById, depthById } = buildSessionTreeRows(data, NONE, NONE);

    expect(collectBranchOwners('d1', parentById, depthById)).toEqual([{ id: 'b1', depth: 0 }]);
    expect(collectBranchOwners('a1', parentById, depthById)).toEqual([]);
  });
});

describe('describeSessionTreeEntry', () => {
  it('prints a tool row as its command plus a hint, and marks an error', () => {
    const description = describeSessionTreeEntry(
      entry('t1', null, 'toolResult', 'boom', {
        toolName: 'bash',
        toolArgs: { command: 'echo hi' },
        isError: true,
      }),
    );

    expect(description).toEqual({
      label: 'bash',
      text: '$ echo hi · boom',
      monospace: true,
      destructive: true,
      trailing: 'error',
    });
  });

  it('trails the compacted size on a compaction row', () => {
    const description = describeSessionTreeEntry(
      entry('c1', null, 'compaction', 'what happened', { tokensBefore: 42000 }),
    );

    expect(description.trailing).toBe('42k tokens');
    expect(description.text).toBe('what happened');
  });
});

/**
 * A lone child continues its parent's line, so a straight conversation of 20000
 * entries is 20000 levels deep, and a recursive walk dies on it (a white window —
 * `Maximum call stack size exceeded`). The depth a session can reach is the
 * length of the session, so the walk may not be recursive.
 */
describe('a session longer than the call stack', () => {
  const LENGTH = 20_000;

  it('lays out a straight conversation of 20000 entries', () => {
    const entries: SessionTreeEntry[] = [];
    for (let index = 0; index < LENGTH; index += 1) {
      entries.push(
        entry(`e${index}`, index === 0 ? null : `e${index - 1}`, 'user', `say ${index}`),
      );
    }
    const data = createSessionTreeData(sessionTree(entries, `e${LENGTH - 1}`));
    const { rows } = buildSessionTreeRows(data, NONE, NONE);

    expect(rows).toHaveLength(LENGTH);
    expect(rows.at(-1)).toEqual({ itemId: `e${LENGTH - 1}`, depth: 0, isBranchChild: false });
  });
});
