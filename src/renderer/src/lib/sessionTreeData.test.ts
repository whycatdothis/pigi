/**
 * Tests for the renderer's session tree data: filtering, the shape rows are
 * indented into, and the two pieces of bookkeeping the navigation flow needs
 * (how much a move abandons, and which forks a row hangs from).
 *
 * These are the rules that were iterated on by hand in the running app; they are
 * pure functions over a DTO, so they can be pinned down here instead.
 */
import { describe, expect, it } from 'vitest';
import type { SessionTreeDto, SessionTreeEntryDto } from '../../../shared/ipcContract';
import {
  SESSION_TREE_ROOT_ID,
  buildSessionTreeDisplay,
  collectBranchOwners,
  createSessionTreeData,
  describeSessionTreeEntry,
  type SessionTreeData,
  type SessionTreeDisplay,
  type SessionTreeKind,
} from './sessionTreeData';
import { countAbandonedEntries } from './sessionTreeLayout';

const TIMESTAMP = 1_767_000_000_000;

function entry(
  id: string,
  parentId: string | null,
  kind: SessionTreeKind,
  preview = '',
  extra: Partial<SessionTreeEntryDto> = {},
): SessionTreeEntryDto {
  return { id, parentId, timestamp: TIMESTAMP, kind, preview, ...extra };
}

function sessionTree(entries: SessionTreeEntryDto[], leafId: string | null): SessionTreeDto {
  return { leafId, entries };
}

/**
 * A chain with one fork in the middle:
 *
 *   h1 ─ a1 ─ b1 ─┬─ c1 ─ d1
 *                 └─ e1
 */
function forkFixture(): SessionTreeDto {
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

function nodeIds(data: SessionTreeData): string[] {
  return data.allItemIds;
}

describe('createSessionTreeData', () => {
  it('keeps the rows in session order and hangs them off one root', () => {
    const data = createSessionTreeData(forkFixture());

    expect(nodeIds(data)).toEqual(['h1', 'a1', 'b1', 'c1', 'd1', 'e1']);
    expect(data.getChildren(SESSION_TREE_ROOT_ID)).toEqual(['h1']);
    expect(data.getItem('c1').parentId).toBe('b1');
    expect(data.currentRootId).toBe('h1');
    expect(data.isFiltered).toBe(false);
    expect(data.rootStatsById.get('h1')?.rowCount).toBe(6);
  });

  it('drops rows of other kinds and re-attaches their children, heads included', () => {
    const data = createSessionTreeData(forkFixture(), {
      kinds: new Set<SessionTreeKind>(['assistant']),
    });

    expect(nodeIds(data)).toEqual(['a1', 'c1', 'd1', 'e1']);
    // The rows a kept row hung from are gone, so it moves up to the nearest kept
    // one — and to the root rather than being left orphaned.
    expect(data.getItem('c1').parentId).toBe('a1');
    expect(data.getItem('a1').parentId).toBe(SESSION_TREE_ROOT_ID);
    expect(data.getChildren(SESSION_TREE_ROOT_ID)).toEqual(['a1']);
    expect(data.matchCount).toBe(4);
    expect(data.isFiltered).toBe(true);
  });

  it('keeps the ancestors of a match, and only matches get highlight indexes', () => {
    const data = createSessionTreeData(forkFixture(), { query: 'done' });

    expect(nodeIds(data)).toEqual(['h1', 'a1', 'b1', 'c1', 'd1']);
    expect(data.matchCount).toBe(1);
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
    expect(describeSessionTreeEntry(data.getItem('t1').entry as SessionTreeEntryDto).text).toBe(
      '$ echo hi · hi',
    );
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
    expect(data.getChildren(SESSION_TREE_ROOT_ID)).toEqual(['h1', 'h2']);
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

describe('buildSessionTreeDisplay', () => {
  function display(
    litRowId: string | null = null,
    hidden: string[] = [],
  ): SessionTreeDisplay & { data: SessionTreeData } {
    const data = createSessionTreeData(forkFixture());
    const visible = new Set(nodeIds(data).filter((id) => !hidden.includes(id)));
    return { data, ...buildSessionTreeDisplay(data, visible, litRowId) };
  }

  it("continues a lone child at its parent's level and indents the children of a fork", () => {
    const { nodes, depthById, parentById } = display();

    expect(nodes.map((node) => node.itemId)).toEqual(['h1']);
    expect(nodes[0].continuation?.continuation?.itemId).toBe('b1');
    const fork = nodes[0].continuation?.continuation;
    expect(fork?.branch?.map((node) => node.itemId)).toEqual(['c1', 'e1']);
    expect(depthById.get('h1')).toBe(0);
    expect(depthById.get('d1')).toBe(1);
    expect(depthById.get('e1')).toBe(1);
    expect(parentById.get('d1')).toBe('c1');
  });

  it('leaves out a folded row and everything under it', () => {
    const { nodes, depthById } = display(null, ['c1']);

    const forkRow = nodes[0].continuation?.continuation;
    // One branch is left, so the fork dissolves into a plain continuation.
    expect(forkRow?.branch).toBe(null);
    expect(forkRow?.continuation?.itemId).toBe('e1');
    expect(depthById.has('d1')).toBe(false);
  });

  it('lights the sibling a path passes on its way down, and turns in at the path itself', () => {
    // The leaf sits under `c1`: the fork's first child is the way down, so the
    // line of the sibling after it stays neutral.
    const down = display('d1');
    const [first, second] = down.nodes[0].continuation?.continuation?.branch ?? [];
    expect([first.railTint, first.elbowTint]).toEqual(['upper', true]);
    expect([second.railTint, second.elbowTint]).toEqual(['none', false]);

    // The other branch: the path passes `c1` on the way to `e1`, so that line is
    // lit all the way through, and `e1` carries the turn.
    const sideways = display('e1');
    const [passed, turn] = sideways.nodes[0].continuation?.continuation?.branch ?? [];
    expect([passed.railTint, passed.elbowTint]).toEqual(['full', false]);
    expect([turn.railTint, turn.elbowTint]).toEqual(['upper', true]);
  });
});

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
    const { parentById, depthById } = buildSessionTreeDisplay(data, new Set(nodeIds(data)));

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
