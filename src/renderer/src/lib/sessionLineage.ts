/**
 * Session lineage: the sidebar's fork tree.
 *
 * A forked session records the file it came from (`parentSession` in its
 * header, carried to the renderer as `parentSessionPath`), so the flat session
 * list can be nested again: a parent plus all its forks form one block, and a
 * block reads as one conversation growing in several directions.
 *
 * Subagents (sessions started by `pigi subagent`) are children too, but they
 * gather in one group row placed first under their parent and collapsed by
 * default: a review run is a side errand, not a direction the conversation took.
 *
 * A session with children can be collapsed, hiding its forks and its group.
 *
 * Pure: the sidebar renders what `flattenLineage` hands it.
 */
import type { PiSessionInfo } from '../../../shared/ipcContract';

export interface LineageNode {
  session: PiSessionInfo;
  /** Forks. */
  children: LineageNode[];
  subagents: LineageNode[];
}

interface RowGeometry {
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

export interface SessionLineageRow extends RowGeometry {
  kind: 'session';
  session: PiSessionInfo;
  /** Has forks or subagents, so it can be collapsed. */
  hasChildren: boolean;
  collapsed: boolean;
}

export interface SubagentGroupRow extends RowGeometry {
  kind: 'subagents';
  parentPath: string;
  /** Every session inside the group, nested ones included, for its summary. */
  sessions: PiSessionInfo[];
  expanded: boolean;
}

export type LineageRow = SessionLineageRow | SubagentGroupRow;

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
    byKey.set(pathKey(session.path), { session, children: [], subagents: [] });
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
    (node.session.isSubagent ? parent.subagents : parent.children).push(node);
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
    sortNodes(node.subagents);
  }
  nodes.sort((left, right) => {
    const byActivity = subtreeActivity(right) - subtreeActivity(left);
    if (byActivity !== 0) return byActivity;
    return left.session.path.localeCompare(right.session.path);
  });
}

function subtreeActivity(node: LineageNode): number {
  let latest = activityTime(node.session);
  for (const child of [...node.children, ...node.subagents]) {
    latest = Math.max(latest, subtreeActivity(child));
  }
  return latest;
}

function subtreeSessions(nodes: LineageNode[]): PiSessionInfo[] {
  return nodes.flatMap((node) => [
    node.session,
    ...subtreeSessions(node.subagents),
    ...subtreeSessions(node.children),
  ]);
}

interface LineageStep {
  parentPath: string;
  throughSubagents: boolean;
}

/** The steps from a root down to `path`: each parent, and whether `path` is under its subagents. */
function stepsTo(roots: LineageNode[], path: string): LineageStep[] {
  const key = pathKey(path);
  function search(node: LineageNode, steps: LineageStep[]): LineageStep[] | null {
    if (pathKey(node.session.path) === key) return steps;
    const parentPath = node.session.path;
    for (const child of node.children) {
      const found = search(child, [...steps, { parentPath, throughSubagents: false }]);
      if (found) return found;
    }
    for (const subagent of node.subagents) {
      const found = search(subagent, [...steps, { parentPath, throughSubagents: true }]);
      if (found) return found;
    }
    return null;
  }
  for (const root of roots) {
    const found = search(root, []);
    if (found) return found;
  }
  return [];
}

/**
 * What to open so that `path` shows, outermost first: every ancestor, which
 * may be collapsed, and the parents whose subagent groups hold it.
 */
export function revealPath(
  roots: LineageNode[],
  path: string,
): { ancestors: string[]; subagentGroups: string[] } {
  const steps = stepsTo(roots, path);
  return {
    ancestors: steps.map((step) => step.parentPath),
    subagentGroups: steps.filter((step) => step.throughSubagents).map((step) => step.parentPath),
  };
}

/**
 * Flatten a lineage forest into the rows the sidebar renders, in order. A
 * parent's subagent group is its first child row; its sessions follow it only
 * while the parent's path is in `expandedGroups`. A session in
 * `collapsedParents` shows none of its children.
 */
export function flattenLineage(
  roots: LineageNode[],
  expandedGroups: ReadonlySet<string> = new Set(),
  collapsedParents: ReadonlySet<string> = new Set(),
): LineageRow[] {
  const rows: LineageRow[] = [];

  function walkSiblings(nodes: LineageNode[], depth: number, above: boolean[]): void {
    nodes.forEach((child, index) => walk(child, depth, index === nodes.length - 1, above));
  }

  function walk(node: LineageNode, depth: number, isLast: boolean, above: boolean[]): void {
    const hasChildren = node.children.length > 0 || node.subagents.length > 0;
    const collapsed = hasChildren && collapsedParents.has(node.session.path);
    rows.push({
      kind: 'session',
      session: node.session,
      hasChildren,
      collapsed,
      depth,
      isLast,
      ancestorContinues: above,
    });
    if (collapsed) return;
    // A depth-1 row opens the first column itself; deeper rows inherit the
    // columns above them, and the parent's column runs on when the parent has
    // a sibling below it.
    const childAbove = depth === 0 ? [] : [...above, !isLast];
    if (node.subagents.length > 0) {
      const groupIsLast = node.children.length === 0;
      const expanded = expandedGroups.has(node.session.path);
      rows.push({
        kind: 'subagents',
        parentPath: node.session.path,
        sessions: subtreeSessions(node.subagents),
        expanded,
        depth: depth + 1,
        isLast: groupIsLast,
        ancestorContinues: childAbove,
      });
      if (expanded) {
        walkSiblings(node.subagents, depth + 2, [...childAbove, !groupIsLast]);
      }
    }
    walkSiblings(node.children, depth + 1, childAbove);
  }

  // Roots are separate conversations: each closes its (unconnected) column.
  roots.forEach((root) => {
    walk(root, 0, true, []);
  });
  return rows;
}

/** How many rows the first `count` roots take, each with every row nested under it. */
export function rowsOfFirstRoots(rows: LineageRow[], count: number): number {
  let roots = 0;
  const index = rows.findIndex((row) => row.depth === 0 && ++roots > count);
  return index === -1 ? rows.length : index;
}
