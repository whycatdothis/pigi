/**
 * Session tree data for the tree dialog.
 *
 * The wire payload is a flat list of visible entries with parent ids rewritten
 * to the nearest visible ancestor (see `src/processes/utility/sessionTree.ts`).
 * headless-tree wants a data loader hanging off a single root; a session can
 * have several roots (going back to before the first message starts a new
 * tree), so the entries hang off a synthetic root item instead.
 *
 * Everything here is pure: shaping, row descriptions and time formatting.
 */
import fuzzysort from 'fuzzysort';
import type { ItemInstance } from '@headless-tree/core';
import type { SessionTree, SessionTreeEntry } from '../../../shared/ipcContract';
import { getToolCommandPartsForTool } from './toolDisplay';

/** Entry kinds, as they arrive from the utility process. */
export type SessionTreeKind = SessionTreeEntry['kind'];

/** headless-tree needs exactly one root; real entries never use this id. */
export const SESSION_TREE_ROOT_ID = '__session-tree-root__';

/** Placeholder for an id the current dataset does not know. */
const EMPTY_ITEM: SessionTreeItem = {
  entry: null,
  parentId: SESSION_TREE_ROOT_ID,
  childIds: [],
};

export interface SessionTreeItem {
  /** null on the synthetic root. */
  entry: SessionTreeEntry | null;
  parentId: string;
  childIds: string[];
}

export interface SessionTreeRootStats {
  /** Rows the tree shows under this root (itself included). */
  rowCount: number;
  startTimestamp: number;
  endTimestamp: number;
}

export interface SessionTreeData {
  rootItemId: string;
  /** Every entry that survived the filter; the initial expansion state. */
  allItemIds: string[];
  /**
   * The session's separate trees, oldest first.
   *
   * Going back to before the first message and continuing starts a new tree, so
   * one session file can hold several. They are numbered by this order, which
   * must not depend on where the leaf currently is: a number that moves would
   * not identify anything.
   */
  rootIds: string[];
  /**
   * Every tree in the session, oldest first, filter or not.
   *
   * The numbering the headers show comes from this, so "Tree 2" means the same
   * thing before, during and after a search — an empty tree keeps its number
   * instead of renumbering the ones below it.
   */
  treeIds: string[];
  /**
   * The tree each entry belongs to, even when a filter dropped the rows in
   * between: with only assistant rows left, a tree no longer hangs off one root
   * row, and the header still has to know where it ends.
   */
  treeRootIdByItemId: Map<string, string>;
  /** Whether a query or a kind filter is narrowing the rows. */
  isFiltered: boolean;
  /** The tree the current leaf belongs to; null only for an empty session. */
  currentRootId: string | null;
  rootStatsById: Map<string, SessionTreeRootStats>;
  /** Number of rows the tree can show (matches plus their ancestors). */
  itemCount: number;
  /** Entries that match the query themselves. */
  matchCount: number;
  /**
   * Positions of the fuzzy match inside each row's text, keyed by entry id.
   * Rows that only survived as ancestors have no entry here.
   */
  matchIndexesById: Map<string, number[]>;
  /**
   * Entries on the active path from the current leaf up to its tree's root.
   *
   * The branch a row belongs to is drawn in the accent when the row sits on the
   * way back to the leaf, so the renderer needs to ask the tree about it.
   */
  activePathIds: ReadonlySet<string>;
  getItem: (itemId: string) => SessionTreeItem;
  getChildren: (itemId: string) => string[];
}

/** One row of the dialog's display tree, nested the way the rows indent. */
export interface SessionTreeDisplayNode {
  itemId: string;
  /**
   * A row's only child: it continues the same line, so it renders at the same
   * nesting level, right after it.
   */
  continuation: SessionTreeDisplayNode | null;
  /**
   * The children of a fork, one per branch.
   *
   * Each of them renders inside a branch wrapper — the element that owns the
   * fork's guide line, so a line spans a whole subtree instead of being pieced
   * together row by row.
   */
  branch: SessionTreeDisplayNode[] | null;
}

/** One row's text: an optional leading chip, the text, an optional trailing chip. */
export interface SessionTreeDescription {
  label?: string;
  text: string;
  /** Tool rows show their command in the monospace face. */
  monospace?: boolean;
  destructive?: boolean;
  trailing?: string;
}

export interface SessionTreeFilter {
  /** Fuzzy query, matched against each row's label and text. */
  query?: string;
  /** Kind filter; empty or omitted means every kind. */
  kinds?: ReadonlySet<SessionTreeKind>;
}

/**
 * Build the tree data, filtered by kind and by a fuzzy query.
 *
 * The two filters are combined with AND: a row must be of a selected kind and
 * match the query. Ancestors of a match are kept so the tree stays readable,
 * but only while they pass the kind filter themselves — "assistant only" must
 * not smuggle user rows back in. Filtered entries re-attach to their nearest
 * surviving ancestor, so a filter never leaves an orphan row behind.
 *
 * Rows keep their session order: this is a tree, not a ranked result list.
 */
export function createSessionTreeData(
  tree: SessionTree,
  filter: SessionTreeFilter = {},
): SessionTreeData {
  const kinds = filter.kinds && filter.kinds.size > 0 ? filter.kinds : null;
  const entries = tree.entries;
  const entryById = new Map<string, SessionTreeEntry>();
  for (const entry of entries) {
    entryById.set(entry.id, entry);
  }
  const effectiveLeafId = tree.leafId;

  const eligibleEntries = kinds ? entries.filter((entry) => kinds.has(entry.kind)) : entries;

  const normalizedQuery = filter.query?.trim().toLowerCase() ?? '';
  let matchingIds: Set<string> | null = null;
  const matchIndexesById = new Map<string, number[]>();
  if (normalizedQuery !== '') {
    matchingIds = new Set<string>();
    for (const entry of eligibleEntries) {
      // Fuzzy, not substring: "astmsg" finds "assistant message".
      const match = fuzzysort.single(normalizedQuery, fuzzyTarget(entry));
      if (!match) continue;
      matchingIds.add(entry.id);
      // The description carries a label (a tool's name) that the row no longer
      // prints; the row's text follows it, so drop the leading indexes.
      const label = describeSessionTreeEntry(entry).label;
      const offset = label ? label.length + 1 : 0;
      matchIndexesById.set(
        entry.id,
        match.indexes.filter((index) => index >= offset).map((index) => index - offset),
      );
    }
  }

  const eligibleIds = new Set(eligibleEntries.map((entry) => entry.id));
  const survivingIds = matchingIds
    ? new Set([...collectAncestorIds(matchingIds, entryById)].filter((id) => eligibleIds.has(id)))
    : kinds
      ? new Set(eligibleIds)
      : null;

  const childIdsByParent = new Map<string, string[]>();
  const parentIdByItemId = new Map<string, string>();
  for (const entry of entries) {
    if (survivingIds && !survivingIds.has(entry.id)) continue;
    const parentId =
      findSurvivingParentId(entry.parentId, survivingIds, entryById) ?? SESSION_TREE_ROOT_ID;
    appendChildId(childIdsByParent, parentId, entry.id);
    parentIdByItemId.set(entry.id, parentId);
  }

  const rootChildIds = childIdsByParent.get(SESSION_TREE_ROOT_ID) ?? [];
  const itemById = new Map<string, SessionTreeItem>();
  itemById.set(SESSION_TREE_ROOT_ID, {
    entry: null,
    parentId: SESSION_TREE_ROOT_ID,
    childIds: rootChildIds,
  });
  for (const entry of entries) {
    const parentId = parentIdByItemId.get(entry.id);
    if (parentId === undefined) continue;
    itemById.set(entry.id, {
      entry,
      parentId,
      childIds: childIdsByParent.get(entry.id) ?? [],
    });
  }

  const allItemIds = [...itemById.keys()].filter((itemId) => itemId !== SESSION_TREE_ROOT_ID);
  const activePathIds = collectActivePathIds(effectiveLeafId, entryById);
  // Every entry in the session, filtered out or not, so the tree numbering is a
  // property of the session and not of the current search.
  const treeIds: string[] = [];
  const treeRootIdByItemId = new Map<string, string>();
  for (const entry of entries) {
    if (entry.parentId === null) {
      treeIds.push(entry.id);
      treeRootIdByItemId.set(entry.id, entry.id);
      continue;
    }
    // Entries arrive in append order, so a parent is always resolved first. A
    // parent the payload does not know starts a tree of its own rather than
    // losing the row: a group with no header is worse than an extra one.
    const parentRootId = treeRootIdByItemId.get(entry.parentId);
    if (parentRootId === undefined) treeIds.push(entry.id);
    treeRootIdByItemId.set(entry.id, parentRootId ?? entry.id);
  }

  return {
    rootItemId: SESSION_TREE_ROOT_ID,
    allItemIds,
    rootIds: rootChildIds,
    treeIds,
    treeRootIdByItemId,
    isFiltered: normalizedQuery !== '' || kinds !== null,
    currentRootId: findRootId(effectiveLeafId, entryById),
    rootStatsById: collectRootStats(rootChildIds, itemById),
    itemCount: allItemIds.length,
    matchCount: matchingIds?.size ?? allItemIds.length,
    matchIndexesById,
    activePathIds,
    // headless-tree can briefly ask for an id from a previous dataset (a hot
    // reload, a filter swap): answer with an empty row instead of throwing.
    getItem: (itemId) => itemById.get(itemId) ?? EMPTY_ITEM,
    getChildren: (itemId) => itemById.get(itemId)?.childIds ?? [],
  };
}

/**
 * Everything a row shows, plus what its kind means for the styling.
 *
 * `isBranchChild` is the one piece of view state: a lone child has no fold
 * affordance, while a child of a fork folds the branch it hangs from.
 */
export function describeSessionTreeRow(
  item: ItemInstance<SessionTreeItem>,
  isBranchChild: boolean,
): {
  canFold: boolean;
  description: SessionTreeDescription;
  isMetaKind: boolean;
  isError: boolean;
} {
  const entry = item.getItemData().entry;
  const childCount = item.getItemData().childIds.length;
  if (!entry) {
    return {
      canFold: false,
      description: { text: '' },
      isMetaKind: false,
      isError: false,
    };
  }
  const description = describeSessionTreeEntry(entry);
  return {
    // Chains have no fold affordance: the rows a fold would hide do not read as
    // children on screen.
    canFold: childCount > 1 || (isBranchChild && childCount > 0),
    description,
    isMetaKind: entry.kind === 'compaction' || entry.kind === 'branchSummary',
    isError: description.destructive === true,
  };
}

/** Row text for the tree list. */
export function describeSessionTreeEntry(entry: SessionTreeEntry): SessionTreeDescription {
  if (entry.kind === 'toolResult') {
    const parts = getToolCommandPartsForTool(entry.toolName ?? 'tool', entry.toolArgs);
    const command = `${parts.prefix} ${parts.body}`.trim();
    return {
      label: entry.toolName ?? 'tool',
      text: entry.preview ? `${command} · ${entry.preview}` : command,
      monospace: true,
      destructive: entry.isError === true,
      trailing: entry.isError === true ? 'error' : undefined,
    };
  }
  if (entry.kind === 'compaction') {
    return {
      label: 'Compacted context',
      text: cleanPreviewText(entry.preview),
      trailing: formatTokenCount(entry.tokensBefore),
    };
  }
  if (entry.kind === 'branchSummary') {
    return {
      label: 'Branch summary',
      text: cleanPreviewText(entry.preview),
      trailing: entry.stopReason === 'error' ? 'error' : undefined,
      destructive: entry.stopReason === 'error',
    };
  }
  return {
    text: cleanPreviewText(entry.preview),
    destructive: entry.stopReason === 'error',
    trailing: entry.stopReason === 'error' ? 'error' : undefined,
  };
}

/**
 * The rows to render, nested the way they indent, plus what the tree shape
 * means for the rows that hang from it.
 */
export interface SessionTreeDisplay {
  nodes: SessionTreeDisplayNode[];
  /** Display parent per row: the fork it hangs from, or the row it continues. */
  parentById: Map<string, string>;
  /** Indent level per row; a lone child shares its parent's level. */
  depthById: Map<string, number>;
}

/**
 * One row of the display as a list, in the order it is drawn.
 *
 * The nesting above is how rows are grouped for drawing. A list needs the rows
 * themselves, each carrying what it takes to draw on its own — the same walk the
 * renderer already does, written down as data, so a list can index a row instead
 * of nesting React elements to find one.
 */
export interface SessionTreeFlatRow {
  itemId: string;
  /** Indent level the row draws at; the roots of a tree start at zero. */
  depth: number;
  /** The row hangs under a fork, so it has a line of its own. */
  isBranchChild: boolean;
  /** The last child of its fork: its line stops at its own elbow. */
  isLastBranchChild: boolean;
  /**
   * The row this one continues, or null when it hangs under a fork or starts a
   * tree. A continuation shares its parent's indent: the same line, one row on.
   */
  continuationOf: string | null;
}

/**
 * Flatten a display into its rows, in document order.
 *
 * Reading order is the order the nesting draws: a row, then what it continues
 * into, then its fork's branches from first to last. Indent, branch flags and
 * the row a continuation continues are the whole of what the renderer passes
 * down its recursion, so the same rows come out of this.
 */
export function flattenSessionTreeDisplay(display: SessionTreeDisplay): SessionTreeFlatRow[] {
  const rows: SessionTreeFlatRow[] = [];

  // The walk keeps its own stack: a conversation is mostly continuations, one per
  // row, so recursion here is as deep as the session is long and a long one takes
  // the renderer down with it. The stack order is the reading order a row at a
  // time: the row, then what it continues into, then its fork's branches.
  interface Frame {
    node: SessionTreeDisplayNode;
    depth: number;
    branch: { isLast: boolean } | null;
    continuationOf: string | null;
  }
  const pending: Frame[] = [];
  for (let index = display.nodes.length - 1; index >= 0; index -= 1) {
    pending.push({ node: display.nodes[index], depth: 0, branch: null, continuationOf: null });
  }

  for (let frame = pending.pop(); frame !== undefined; frame = pending.pop()) {
    const { node, depth, branch, continuationOf } = frame;
    rows.push({
      itemId: node.itemId,
      depth,
      isBranchChild: branch !== null,
      isLastBranchChild: branch?.isLast ?? false,
      continuationOf: branch === null ? continuationOf : null,
    });
    const children = node.branch ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push({
        node: children[index],
        depth: depth + 1,
        branch: { isLast: index === children.length - 1 },
        continuationOf: null,
      });
    }
    // Pushed last, so it is read next: the row's continuation comes before its fork.
    if (node.continuation !== null) {
      pending.push({ node: node.continuation, depth, branch: null, continuationOf: node.itemId });
    }
  }

  return rows;
}

/**
 * Nest the rows the way they indent, for the renderer.
 *
 * A conversation is mostly a straight line: indenting every message would
 * staircase off the right edge, so only real forks indent. A lone child
 * continues at its parent's level, and every child of a fork moves one level
 * deeper — which is exactly the nesting here, and the reason a fork's guide
 * line can belong to the subtree instead of to each row it passes.
 *
 * `visibleItemIds` is what the tree currently shows (folds and filters
 * applied); anything else is left out. What the lit path does to the branch
 * lines is not part of this: a line belongs to a fork, and the renderer derives
 * which lines the path lights from the row the light is on (`collectPathOwners`
 * below), so a pointer moving along a branch does not rebuild the tree.
 */
export function buildSessionTreeDisplay(
  data: SessionTreeData,
  visibleItemIds: ReadonlySet<string>,
): SessionTreeDisplay {
  const parentById = new Map<string, string>();
  const depthById = new Map<string, number>();

  // Nodes are linked as they are created and filled in as the walk reaches them,
  // so the shape is built without recursing: a lone child is a continuation, and
  // a straight conversation has one per row — deeper than the call stack allows.
  const nodeById = new Map<string, SessionTreeDisplayNode>();
  const nodeFor = (itemId: string): SessionTreeDisplayNode => {
    const existing = nodeById.get(itemId);
    if (existing !== undefined) return existing;
    const created: SessionTreeDisplayNode = { itemId, continuation: null, branch: null };
    nodeById.set(itemId, created);
    return created;
  };

  const rootIds = data.getChildren(data.rootItemId).filter((rootId) => visibleItemIds.has(rootId));
  const pending: { itemId: string; parentId: string | null; depth: number }[] = rootIds.map(
    (itemId) => ({ itemId, parentId: null, depth: 0 }),
  );

  for (let frame = pending.pop(); frame !== undefined; frame = pending.pop()) {
    const { itemId, parentId, depth } = frame;
    if (parentId !== null) parentById.set(itemId, parentId);
    depthById.set(itemId, depth);
    const node = nodeFor(itemId);
    const childIds = data.getChildren(itemId).filter((childId) => visibleItemIds.has(childId));
    if (childIds.length === 1) {
      // A continuation shares the level: it is the same line, one row further.
      node.continuation = nodeFor(childIds[0]);
      pending.push({ itemId: childIds[0], parentId: itemId, depth });
      continue;
    }
    if (childIds.length > 1) {
      node.branch = childIds.map((childId) => nodeFor(childId));
      // Pushed backwards so the branches are walked first to last: the maps this
      // records are read in that order.
      for (let index = childIds.length - 1; index >= 0; index -= 1) {
        pending.push({ itemId: childIds[index], parentId: itemId, depth: depth + 1 });
      }
    }
  }

  return { nodes: rootIds.map((rootId) => nodeFor(rootId)), parentById, depthById };
}

/**
 * Every row between `itemId` and the root of its tree, closest first.
 */
function collectRowAncestors(itemId: string, parentById: ReadonlyMap<string, string>): string[] {
  const ancestors: string[] = [];
  const seen = new Set<string>([itemId]);
  let currentId = parentById.get(itemId);
  while (currentId !== undefined && !seen.has(currentId)) {
    seen.add(currentId);
    ancestors.push(currentId);
    currentId = parentById.get(currentId);
  }
  return ancestors;
}

/**
 * For each indent level, the row the path *enters* that level through.
 *
 * Walking up from `rowId` to its tree's root passes exactly one branch child per
 * level — the row whose elbow the line turns in at. Everything the renderer does
 * with a lit path follows from this: the fork's line lights from its edge down to
 * the lit row, the siblings it passes on the way light with it, and the lines
 * after it do not.
 */
export function collectPathOwners(
  rowId: string,
  parentById: ReadonlyMap<string, string>,
  depthById: ReadonlyMap<string, number>,
): Map<number, string> {
  const owners = new Map<number, string>();
  const consider = (candidateId: string): void => {
    const parentId = parentById.get(candidateId);
    const depth = depthById.get(candidateId);
    if (parentId === undefined || depth === undefined) return;
    const parentDepth = depthById.get(parentId);
    // A branch child: its parent sits one indent level up. Chain rows share
    // their parent's level and own no line of their own.
    if (parentDepth === undefined || parentDepth >= depth) return;
    if (!owners.has(depth)) owners.set(depth, candidateId);
  };
  consider(rowId);
  for (const ancestorId of collectRowAncestors(rowId, parentById)) consider(ancestorId);
  return owners;
}

/**
 * The rows whose branch line runs above `itemId`, outermost first.
 *
 * These are the forks the reader can see as lines, and they are exactly the forks
 * of the lit path: one row per indent level, so the band is as tall as the
 * nesting and not as long as the conversation.
 */
export function collectBranchOwners(
  itemId: string,
  parentById: ReadonlyMap<string, string>,
  depthById: ReadonlyMap<string, number>,
): { id: string; depth: number }[] {
  const owners = [...collectPathOwners(itemId, parentById, depthById)].sort(
    (first, second) => first[0] - second[0],
  );
  const forks: { id: string; depth: number }[] = [];
  for (const [, ownerId] of owners) {
    const forkId = parentById.get(ownerId);
    const forkDepth = forkId === undefined ? undefined : depthById.get(forkId);
    if (forkId === undefined || forkDepth === undefined) continue;
    forks.push({ id: forkId, depth: forkDepth });
  }
  return forks;
}

/** Entry ids on the active path, deepest first. */
function collectActivePathIds(
  leafId: string | null,
  entryById: Map<string, SessionTreeEntry>,
): Set<string> {
  const ids = new Set<string>();
  let current = leafId ? entryById.get(leafId) : undefined;
  while (current) {
    ids.add(current.id);
    current = current.parentId ? entryById.get(current.parentId) : undefined;
  }
  return ids;
}

// Built once: a row calls this on every render, and constructing a formatter is
// the expensive part of it.
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
});
const DATE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});
const DATE_TIME_FORMAT_THIS_YEAR = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

export function formatSessionTreeTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return TIME_FORMAT.format(date);
  }
  return (
    date.getFullYear() === now.getFullYear() ? DATE_TIME_FORMAT_THIS_YEAR : DATE_TIME_FORMAT
  ).format(date);
}

/** The matched entries plus every ancestor needed to reach them. */
function collectAncestorIds(
  matchingIds: ReadonlySet<string>,
  entryById: Map<string, SessionTreeEntry>,
): Set<string> {
  const ids = new Set<string>();
  for (const id of matchingIds) {
    let current: SessionTreeEntry | undefined = entryById.get(id);
    while (current && !ids.has(current.id)) {
      ids.add(current.id);
      current = current.parentId ? entryById.get(current.parentId) : undefined;
    }
  }
  return ids;
}

/** The string a query is matched against: the row's label and text. */
function fuzzyTarget(entry: SessionTreeEntry): string {
  const description = describeSessionTreeEntry(entry);
  return description.label ? `${description.label} ${description.text}` : description.text;
}

function findSurvivingParentId(
  parentId: string | null,
  survivingIds: Set<string> | null,
  entryById: Map<string, SessionTreeEntry>,
): string | null {
  let currentId = parentId;
  while (currentId !== null) {
    if (!survivingIds || survivingIds.has(currentId)) return currentId;
    currentId = entryById.get(currentId)?.parentId ?? null;
  }
  return null;
}

/** Rows and time span per tree, for the section headers. */
function collectRootStats(
  rootChildIds: string[],
  itemById: Map<string, SessionTreeItem>,
): Map<string, SessionTreeRootStats> {
  const stats = new Map<string, SessionTreeRootStats>();
  for (const rootId of rootChildIds) {
    let rowCount = 0;
    let startTimestamp = Number.POSITIVE_INFINITY;
    let endTimestamp = Number.NEGATIVE_INFINITY;
    const stack = [rootId];
    while (stack.length > 0) {
      const itemId = stack.pop() as string;
      const item = itemById.get(itemId);
      if (!item) continue;
      rowCount += 1;
      const timestamp = item.entry?.timestamp;
      if (timestamp !== undefined) {
        startTimestamp = Math.min(startTimestamp, timestamp);
        endTimestamp = Math.max(endTimestamp, timestamp);
      }
      stack.push(...item.childIds);
    }
    stats.set(rootId, {
      rowCount,
      startTimestamp: Number.isFinite(startTimestamp) ? startTimestamp : 0,
      endTimestamp: Number.isFinite(endTimestamp) ? endTimestamp : 0,
    });
  }
  return stats;
}

/** The tree an entry belongs to; an entry without a parent is its own tree. */
function findRootId(
  leafId: string | null,
  entryById: Map<string, SessionTreeEntry>,
): string | null {
  if (!leafId) return null;
  let current = entryById.get(leafId);
  while (current?.parentId) {
    const parent: SessionTreeEntry | undefined = entryById.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current?.id ?? null;
}

function appendChildId(
  childIdsByParent: Map<string, string[]>,
  parentId: string,
  childId: string,
): void {
  const siblings = childIdsByParent.get(parentId);
  if (siblings) {
    siblings.push(childId);
  } else {
    childIdsByParent.set(parentId, [childId]);
  }
}

/** Previews are single-line already; drop the inline-code marks. */
function cleanPreviewText(preview: string): string {
  return preview.replace(/`/g, '');
}

function formatTokenCount(tokensBefore: number | undefined): string | undefined {
  if (!tokensBefore) return undefined;
  return `${Math.round(tokensBefore / 1000)}k tokens`;
}
