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
import type { SessionTreeDto, SessionTreeEntryDto } from '../../../shared/ipcContract';
import { getToolCommandPartsForTool } from './toolDisplay';

/** Entry kinds, as they arrive from the utility process. */
export type SessionTreeKind = SessionTreeEntryDto['kind'];

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
  entry: SessionTreeEntryDto | null;
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
   * Indent level per entry.
   *
   * The session tree nests one entry per message, but a conversation is mostly
   * a straight line. Indenting every message would staircase off the right
   * edge, so only real branches indent: a lone child continues at its parent's
   * level, and each child of a fork that is not the one the active path
   * follows starts a branch one level deeper.
   */
  depthById: Map<string, number>;
  /** First row of a branch; folding it folds the rest of that branch. */
  branchStartIds: Set<string>;
  getItem: (itemId: string) => SessionTreeItem;
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
  tree: SessionTreeDto,
  filter: SessionTreeFilter = {},
): SessionTreeData {
  const kinds = filter.kinds && filter.kinds.size > 0 ? filter.kinds : null;
  const entries = tree.entries;
  const entryById = new Map<string, SessionTreeEntryDto>();
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
      // The label chip is rendered separately, so only highlight the text part.
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
  const { depthById, branchStartIds } = assignDisplayDepths({
    rootChildIds: itemById.get(SESSION_TREE_ROOT_ID)?.childIds ?? [],
    childIds: (itemId) => itemById.get(itemId)?.childIds ?? [],
    activePathIds,
  });

  return {
    rootItemId: SESSION_TREE_ROOT_ID,
    allItemIds,
    rootIds: rootChildIds,
    currentRootId: findRootId(effectiveLeafId, entryById),
    rootStatsById: collectRootStats(rootChildIds, itemById),
    itemCount: allItemIds.length,
    matchCount: matchingIds?.size ?? allItemIds.length,
    matchIndexesById,
    depthById,
    branchStartIds,
    // headless-tree can briefly ask for an id from a previous dataset (a hot
    // reload, a filter swap): answer with an empty row instead of throwing.
    getItem: (itemId) => itemById.get(itemId) ?? EMPTY_ITEM,
    getChildren: (itemId) => itemById.get(itemId)?.childIds ?? [],
  };
}

/** Row text for the tree list. */
export function describeSessionTreeEntry(entry: SessionTreeEntryDto): SessionTreeDescription {
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
 * Walk the tree the way it is displayed: follow the active path straight down,
 * indent everything else.
 */
function assignDisplayDepths(options: {
  rootChildIds: string[];
  childIds: (itemId: string) => string[];
  activePathIds: ReadonlySet<string>;
}): { depthById: Map<string, number>; branchStartIds: Set<string> } {
  const depthById = new Map<string, number>();
  const branchStartIds = new Set<string>();

  const walk = (itemId: string, depth: number, startsBranch: boolean): void => {
    depthById.set(itemId, depth);
    if (startsBranch) branchStartIds.add(itemId);
    const childIds = options.childIds(itemId);
    if (childIds.length === 0) return;
    // A lone child is a continuation, not a branch.
    const continuationId =
      childIds.length === 1
        ? childIds[0]
        : childIds.find((childId) => options.activePathIds.has(childId));
    for (const childId of childIds) {
      const continues = childId === continuationId;
      walk(childId, continues ? depth : depth + 1, !continues);
    }
  };

  for (const rootId of options.rootChildIds) {
    walk(rootId, 0, false);
  }
  return { depthById, branchStartIds };
}

/** Entry ids on the active path, deepest first. */
function collectActivePathIds(
  leafId: string | null,
  entryById: Map<string, SessionTreeEntryDto>,
): Set<string> {
  const ids = new Set<string>();
  let current = leafId ? entryById.get(leafId) : undefined;
  while (current) {
    ids.add(current.id);
    current = current.parentId ? entryById.get(current.parentId) : undefined;
  }
  return ids;
}

export function formatSessionTreeTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
    }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, {
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/** The matched entries plus every ancestor needed to reach them. */
function collectAncestorIds(
  matchingIds: ReadonlySet<string>,
  entryById: Map<string, SessionTreeEntryDto>,
): Set<string> {
  const ids = new Set<string>();
  for (const id of matchingIds) {
    let current: SessionTreeEntryDto | undefined = entryById.get(id);
    while (current && !ids.has(current.id)) {
      ids.add(current.id);
      current = current.parentId ? entryById.get(current.parentId) : undefined;
    }
  }
  return ids;
}

/** The string a query is matched against: the row's label and text. */
export function fuzzyTarget(entry: SessionTreeEntryDto): string {
  const description = describeSessionTreeEntry(entry);
  return description.label ? `${description.label} ${description.text}` : description.text;
}

export function matchesSessionTreeQuery(entry: SessionTreeEntryDto, query: string): boolean {
  return fuzzyTarget(entry).toLowerCase().includes(query);
}

function findSurvivingParentId(
  parentId: string | null,
  survivingIds: Set<string> | null,
  entryById: Map<string, SessionTreeEntryDto>,
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
  entryById: Map<string, SessionTreeEntryDto>,
): string | null {
  if (!leafId) return null;
  let current = entryById.get(leafId);
  while (current?.parentId) {
    const parent: SessionTreeEntryDto | undefined = entryById.get(current.parentId);
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
