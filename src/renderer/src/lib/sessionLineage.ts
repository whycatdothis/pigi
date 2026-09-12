/**
 * Session lineage: the sidebar's fork tree.
 *
 * A forked session records the file it came from (`parentSession` in its
 * header, carried to the renderer as `parentSessionPath`), so the flat session
 * list can be nested again: a parent plus all its forks form one block, and a
 * block reads as one conversation growing in several directions.
 *
 * Pure: the sidebar renders what `flattenLineage` hands it.
 */
import type { PiSessionInfo } from '../../../shared/ipcContract';

export interface LineageNode {
  session: PiSessionInfo;
  children: LineageNode[];
}

export interface LineageRow {
  session: PiSessionInfo;
  /** 0 for a root session, 1 for a direct fork, and so on. */
  depth: number;
  /** Last of its siblings: the row closes its indent column. */
  isLast: boolean;
  /**
   * One entry per ancestor level above the row's own column (`length ===
   * depth - 1`): whether that ancestor has a following sibling, i.e. whether
   * the indent line at that column runs on below the row.
   */
  ancestorContinues: boolean[];
}

/**
 * A path's identity for lineage lookups. Windows paths are case-insensitive,
 * so `C:\Users\me\x.jsonl` and `c:\users\me\X.jsonl` are the same file; POSIX
 * paths are compared as they are.
 */
function pathKey(path: string): string {
  return /^[a-zA-Z]:[\\/]|^\\\\/.test(path) ? path.toLowerCase() : path;
}

/** Latest activity in a session's subtree: what a block is ordered by. */
function activityTime(session: PiSessionInfo): number {
  const time = Date.parse(session.modified || session.created);
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Nest sessions under the session they were forked from.
 *
 * A session whose parent is not in `sessions` (the parent was deleted, or it
 * lives in another project) is a root. Blocks — a parent with its whole
 * subtree — are ordered by the latest activity inside them, children the same
 * way, so a fork that is being used surfaces with its parent instead of
 * sinking on its own creation time.
 */
export function buildLineage(sessions: PiSessionInfo[]): LineageNode[] {
  const byKey = new Map<string, LineageNode>();
  for (const session of sessions) {
    byKey.set(pathKey(session.path), { session, children: [] });
  }

  const roots: LineageNode[] = [];
  for (const node of byKey.values()) {
    const parentKey = node.session.parentSessionPath
      ? pathKey(node.session.parentSessionPath)
      : null;
    const parent = parentKey === null ? undefined : byKey.get(parentKey);
    // A self-reference or a cycle (two files claiming each other, which means
    // a hand-edited session) would otherwise lose both sessions from the list.
    if (!parent || parent === node || parentChainContains(parent, node, byKey)) {
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }

  sortNodes(roots);
  return roots;
}

/**
 * Whether `node` is on `candidate`'s parent chain. Attaching `node` under
 * `candidate` would then close a ring, so it is treated as a root instead.
 */
function parentChainContains(
  candidate: LineageNode,
  node: LineageNode,
  byKey: Map<string, LineageNode>,
): boolean {
  const seen = new Set<string>([pathKey(node.session.path)]);
  let current: LineageNode | undefined = candidate;
  while (current) {
    const key = pathKey(current.session.path);
    if (seen.has(key)) return true;
    seen.add(key);
    current = current.session.parentSessionPath
      ? byKey.get(pathKey(current.session.parentSessionPath))
      : undefined;
  }
  return false;
}

/** Sort by subtree activity, newest first; equal times keep a stable order. */
function sortNodes(nodes: LineageNode[]): void {
  for (const node of nodes) {
    sortNodes(node.children);
  }
  nodes.sort((left, right) => {
    const byActivity = subtreeActivity(right) - subtreeActivity(left);
    if (byActivity !== 0) return byActivity;
    return left.session.path.localeCompare(right.session.path);
  });
}

function subtreeActivity(node: LineageNode): number {
  let latest = activityTime(node.session);
  for (const child of node.children) {
    latest = Math.max(latest, subtreeActivity(child));
  }
  return latest;
}

/** Flatten a lineage forest into the rows the sidebar renders, in order. */
export function flattenLineage(roots: LineageNode[]): LineageRow[] {
  const rows: LineageRow[] = [];

  function walk(node: LineageNode, depth: number, isLast: boolean, above: boolean[]): void {
    rows.push({ session: node.session, depth, isLast, ancestorContinues: above });
    node.children.forEach((child, index) => {
      // A depth-1 row opens the first column itself; deeper rows inherit the
      // columns above them, and the parent's column runs on when the parent has
      // a sibling below it.
      const childAbove = depth === 0 ? [] : [...above, !isLast];
      walk(child, depth + 1, index === node.children.length - 1, childAbove);
    });
  }

  // Roots are separate conversations: each closes its (unconnected) column.
  roots.forEach((root) => {
    walk(root, 0, true, []);
  });
  return rows;
}
