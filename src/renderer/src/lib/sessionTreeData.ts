/**
 * Session tree data for the tree dialog.
 *
 * The wire payload is a flat list of visible entries with parent ids rewritten
 * to the nearest visible ancestor (see `src/processes/utility/sessionTree.ts`).
 * A session can have several roots (going back to before the first message
 * starts a new tree), so the entries hang off a synthetic root item.
 *
 * Everything here is pure: shaping, row descriptions and time formatting.
 */
import fuzzysort from 'fuzzysort';
import type { SessionTree, SessionTreeEntry } from '../../../shared/ipcContract';
import { getToolCommandPartsForTool } from './toolDisplay';

/** Entry kinds, as they arrive from the utility process. */
export type SessionTreeKind = SessionTreeEntry['kind'];

/** The parent of every tree's root; real entries never use this id. */
export const SESSION_TREE_ROOT_ID = '__session-tree-root__';

export interface SessionTreeItem {
  entry: SessionTreeEntry;
  /** The surviving parent, or `SESSION_TREE_ROOT_ID` for a row that starts a tree. */
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
  /** The tree the current leaf belongs to; null for an empty session or when
   *  the session is back before the first message (no leaf). */
  currentRootId: string | null;
  rootStatsById: Map<string, SessionTreeRootStats>;
  /** Number of rows the tree can show (matches plus their ancestors). */
  itemCount: number;
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
  getItem: (itemId: string) => SessionTreeItem | undefined;
  getChildren: (itemId: string) => string[];
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
  for (const entry of entries) {
    const parentId = parentIdByItemId.get(entry.id);
    if (parentId === undefined) continue;
    itemById.set(entry.id, {
      entry,
      parentId,
      childIds: childIdsByParent.get(entry.id) ?? [],
    });
  }

  const activePathIds = collectActivePathIds(tree.visibleLeafId, entryById);
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
    rootIds: rootChildIds,
    treeIds,
    treeRootIdByItemId,
    isFiltered: normalizedQuery !== '' || kinds !== null,
    currentRootId: findRootId(tree.visibleLeafId, entryById),
    rootStatsById: collectRootStats(rootChildIds, itemById),
    itemCount: itemById.size,
    matchIndexesById,
    activePathIds,
    getItem: (itemId) => itemById.get(itemId),
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
  entry: SessionTreeEntry,
  childCount: number,
  isBranchChild: boolean,
): {
  canFold: boolean;
  description: SessionTreeDescription;
  isMetaKind: boolean;
  isError: boolean;
} {
  const description = describeSessionTreeEntry(entry);
  return {
    // Chains have no fold affordance: the rows a fold would hide do not read as
    // children on screen.
    canFold: canFoldRow(childCount, isBranchChild),
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
 * Whether a row has a fold affordance. Chains have none: the rows a fold would
 * hide do not read as children on screen.
 */
export function canFoldRow(childCount: number, isBranchChild: boolean): boolean {
  return childCount > 1 || (isBranchChild && childCount > 0);
}

/** One row of the list, carrying what it takes to draw on its own. */
export interface SessionTreeFlatRow {
  itemId: string;
  /** Indent level the row draws at; the roots of a tree start at zero. */
  depth: number;
  /** The row hangs under a fork, so it has a line of its own. */
  isBranchChild: boolean;
}

/** The rows to draw, in reading order, and the shape they hang from. */
export interface SessionTreeRows {
  rows: SessionTreeFlatRow[];
  /** Display parent per row: the fork it hangs from, or the row it continues. */
  parentById: Map<string, string>;
  /** Indent level per row; a lone child shares its parent's level. */
  depthById: Map<string, number>;
}

/**
 * The rows the list draws, in reading order.
 *
 * A conversation is mostly a straight line: indenting every message would
 * staircase off the right edge, so only real forks indent. A lone child
 * continues at its parent's level, and every child of a fork moves one level
 * deeper. Reading order is depth-first: a row, then what it continues into or
 * its fork's branches, first to last.
 *
 * The rows of a folded tree are left out, and so is everything under a folded
 * row. What the lit path does to the branch lines is not part of this: the
 * renderer derives it from the row the light is on (`collectPathOwners` below),
 * so a pointer moving along a branch does not rebuild the rows.
 *
 * The walk keeps its own stack: a straight conversation is one level per
 * message, deeper than the call stack allows.
 */
export function buildSessionTreeRows(
  data: SessionTreeData,
  foldedItemIds: ReadonlySet<string>,
  collapsedTreeIds: ReadonlySet<string>,
): SessionTreeRows {
  const rows: SessionTreeFlatRow[] = [];
  const parentById = new Map<string, string>();
  const depthById = new Map<string, number>();

  interface Frame {
    itemId: string;
    parentId: string | null;
    depth: number;
    isBranchChild: boolean;
  }
  const rootIds = data.rootIds.filter(
    (rootId) => !collapsedTreeIds.has(data.treeRootIdByItemId.get(rootId) ?? rootId),
  );
  const pending: Frame[] = rootIds
    .map((itemId) => ({ itemId, parentId: null, depth: 0, isBranchChild: false }))
    .reverse();

  for (let frame = pending.pop(); frame !== undefined; frame = pending.pop()) {
    const { itemId, parentId, depth, isBranchChild } = frame;
    rows.push({ itemId, depth, isBranchChild });
    if (parentId !== null) parentById.set(itemId, parentId);
    depthById.set(itemId, depth);
    const childIds = foldedItemIds.has(itemId) ? [] : data.getChildren(itemId);
    const isFork = childIds.length > 1;
    // Pushed backwards, so they are read first to last.
    for (let index = childIds.length - 1; index >= 0; index -= 1) {
      pending.push({
        itemId: childIds[index],
        parentId: itemId,
        depth: isFork ? depth + 1 : depth,
        isBranchChild: isFork,
      });
    }
  }

  return { rows, parentById, depthById };
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
    for (let itemId = stack.pop(); itemId !== undefined; itemId = stack.pop()) {
      const item = itemById.get(itemId);
      if (!item) continue;
      rowCount += 1;
      startTimestamp = Math.min(startTimestamp, item.entry.timestamp);
      endTimestamp = Math.max(endTimestamp, item.entry.timestamp);
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
