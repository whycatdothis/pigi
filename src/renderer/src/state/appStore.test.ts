// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COLLAPSED_SESSION_PARENTS_STORAGE_KEY,
  EXPANDED_SUBAGENT_GROUPS_STORAGE_KEY,
  LAST_FILE_STORAGE_KEY,
  QUOTES_STORAGE_KEY,
  useAppStore,
  workspaceProjectForSession,
} from './appStore';

const backgroundPath = '/sessions/background.jsonl';
const activePath = '/sessions/active.jsonl';

function finishRun(sessionPath: string): void {
  const store = useAppStore.getState();
  store.updateSession(sessionPath, { status: 'streaming' });
  store.updateSession(sessionPath, { status: 'tool_running' });
  store.updateSession(sessionPath, { status: 'idle' });
}

describe('unread sessions', () => {
  beforeEach(() => {
    useAppStore.setState({
      sessions: new Map(),
      activeSessionPath: null,
      unreadSessionPaths: new Set(),
      workspaceTab: 'chat',
    });
    const store = useAppStore.getState();
    store.addSession(backgroundPath, '/project');
    store.addSession(activePath, '/project');
    store.setActiveSession(activePath);
  });

  it('marks a session that finishes in the background and clears it when opened', () => {
    finishRun(backgroundPath);
    expect(useAppStore.getState().unreadSessionPaths.has(backgroundPath)).toBe(true);

    useAppStore.getState().setActiveSession(backgroundPath);
    expect(useAppStore.getState().unreadSessionPaths.has(backgroundPath)).toBe(false);
  });

  it('keeps the mark when the background process exits', () => {
    finishRun(backgroundPath);
    useAppStore.getState().removeSession(backgroundPath);
    expect(useAppStore.getState().unreadSessionPaths.has(backgroundPath)).toBe(true);
  });

  it('persists marks to localStorage', () => {
    finishRun(backgroundPath);
    expect(JSON.parse(localStorage.getItem('pigi.unreadSessionPaths') ?? '[]')).toEqual([
      backgroundPath,
    ]);

    useAppStore.getState().setActiveSession(backgroundPath);
    expect(JSON.parse(localStorage.getItem('pigi.unreadSessionPaths') ?? '[]')).toEqual([]);
  });

  it('does not mark the session the user is viewing', () => {
    finishRun(activePath);
    expect(useAppStore.getState().unreadSessionPaths.size).toBe(0);
  });

  it('marks the open session finishing while Files or Diff is shown, until Chat is', () => {
    const store = useAppStore.getState();
    store.setWorkspaceTab('files');
    finishRun(activePath);
    expect(useAppStore.getState().unreadSessionPaths.has(activePath)).toBe(true);

    store.setWorkspaceTab('git');
    expect(useAppStore.getState().unreadSessionPaths.has(activePath)).toBe(true);
    store.setWorkspaceTab('chat');
    expect(useAppStore.getState().unreadSessionPaths.has(activePath)).toBe(false);
  });

  it('keeps the mark when a session is opened outside the Chat tab', () => {
    finishRun(backgroundPath);
    const store = useAppStore.getState();
    store.setWorkspaceTab('files');
    store.setActiveSession(backgroundPath);
    expect(useAppStore.getState().unreadSessionPaths.has(backgroundPath)).toBe(true);
  });

  it('does not mark a session that was never running', () => {
    const store = useAppStore.getState();
    store.updateSession(backgroundPath, { status: 'error' });
    store.updateSession(backgroundPath, { status: 'idle' });
    expect(useAppStore.getState().unreadSessionPaths.size).toBe(0);
  });
});

describe('quotes', () => {
  const quotesOf = (sessionPath: string): string[] =>
    (useAppStore.getState().quotesBySession.get(sessionPath) ?? []).map(
      (quote) => `${quote.text}|${quote.comment}`,
    );

  beforeEach(() => {
    useAppStore.setState({ quotesBySession: new Map(), rightSidebarOpen: false });
  });

  it('adds quotes per session and opens the right sidebar', () => {
    const store = useAppStore.getState();
    store.addQuote(activePath, { text: 'first' }, 'a');
    store.addQuote(activePath, { text: 'second' }, '');
    expect(quotesOf(activePath)).toEqual(['first|a', 'second|']);
    expect(useAppStore.getState().rightSidebarOpen).toBe(true);
    store.addQuote(backgroundPath, { text: 'other' }, 'b');
    expect(quotesOf(backgroundPath)).toEqual(['other|b']);
  });

  it('opens and closes one right sidebar for every session', () => {
    const store = useAppStore.getState();
    store.toggleRightSidebar();
    expect(useAppStore.getState().rightSidebarOpen).toBe(true);
    store.toggleRightSidebar();
    expect(useAppStore.getState().rightSidebarOpen).toBe(false);
  });

  it('updates and removes a quote by id', () => {
    const store = useAppStore.getState();
    store.addQuote(activePath, { text: 'first' }, 'a');
    store.addQuote(activePath, { text: 'second' }, 'b');
    const [first, second] = useAppStore.getState().quotesBySession.get(activePath) ?? [];
    store.updateQuoteComment(activePath, second.id, 'changed');
    store.removeQuote(activePath, first.id);
    expect(quotesOf(activePath)).toEqual(['second|changed']);
  });

  it('saves quotes to localStorage after a short delay', () => {
    vi.useFakeTimers();
    try {
      useAppStore.getState().addQuote(activePath, { text: 'kept' }, 'note');
      vi.runAllTimers();
      const stored: unknown = JSON.parse(localStorage.getItem(QUOTES_STORAGE_KEY) ?? '{}');
      expect(stored).toMatchObject({
        [activePath]: { value: [{ text: 'kept', comment: 'note' }] },
      });

      useAppStore.getState().setSessionQuotes(activePath, []);
      vi.runAllTimers();
      expect(localStorage.getItem(QUOTES_STORAGE_KEY)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops a session entry once its last quote is gone', () => {
    const store = useAppStore.getState();
    store.addQuote(activePath, { text: 'only' }, '');
    const [only] = useAppStore.getState().quotesBySession.get(activePath) ?? [];
    store.removeQuote(activePath, only.id);
    expect(useAppStore.getState().quotesBySession.has(activePath)).toBe(false);

    store.addQuote(activePath, { text: 'again' }, '');
    store.setSessionQuotes(activePath, []);
    expect(useAppStore.getState().quotesBySession.has(activePath)).toBe(false);
  });
});

describe('last opened file', () => {
  beforeEach(() => {
    useAppStore.setState({ lastFileByProject: new Map() });
  });

  it('remembers one file per project and persists it', () => {
    vi.useFakeTimers();
    try {
      useAppStore.getState().setLastFile('/project-a', 'src/a.ts');
      useAppStore.getState().setLastFile('/project-b', 'README.md');
      expect([...useAppStore.getState().lastFileByProject.entries()]).toEqual([
        ['/project-a', 'src/a.ts'],
        ['/project-b', 'README.md'],
      ]);

      vi.runAllTimers();
      const stored: unknown = JSON.parse(localStorage.getItem(LAST_FILE_STORAGE_KEY) ?? '{}');
      expect(stored).toMatchObject({
        '/project-a': { value: 'src/a.ts' },
        '/project-b': { value: 'README.md' },
      });

      useAppStore.setState({ lastFileByProject: new Map() });
      vi.runAllTimers();
      expect(localStorage.getItem(LAST_FILE_STORAGE_KEY)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('open file tabs', () => {
  beforeEach(() => {
    useAppStore.setState({ lastFileByProject: new Map(), openFilesByProject: new Map() });
  });

  const tabs = (): readonly string[] | undefined =>
    useAppStore.getState().openFilesByProject.get('/p');
  const active = (): string | undefined => useAppStore.getState().lastFileByProject.get('/p');

  it('opens a tab right of the active one, and reuses an open tab', () => {
    const store = useAppStore.getState();
    store.setLastFile('/p', 'a.ts');
    store.setLastFile('/p', 'b.ts');
    store.setLastFile('/p', 'a.ts');
    store.setLastFile('/p', 'c.ts');
    expect(tabs()).toEqual(['a.ts', 'c.ts', 'b.ts']);
    expect(active()).toBe('c.ts');
  });

  it('drops the first tab past eight', () => {
    const store = useAppStore.getState();
    const paths = Array.from({ length: 9 }, (_, index) => `${index}.ts`);
    for (const path of paths) store.setLastFile('/p', path);
    expect([tabs(), active()]).toEqual([paths.slice(1), '8.ts']);
  });

  it('activates the right neighbour of a closed active tab, else the left one', () => {
    const store = useAppStore.getState();
    for (const path of ['a.ts', 'b.ts', 'c.ts']) store.setLastFile('/p', path);
    store.setLastFile('/p', 'b.ts');
    store.closeFile('/p', 'b.ts');
    expect([tabs(), active()]).toEqual([['a.ts', 'c.ts'], 'c.ts']);
    store.closeFile('/p', 'c.ts');
    expect([tabs(), active()]).toEqual([['a.ts'], 'a.ts']);
    store.closeFile('/p', 'a.ts');
    expect([tabs(), active()]).toEqual([[], undefined]);
  });

  it('starts history from the file on screen, and records the tab a close brings forward', () => {
    useAppStore.setState({ fileHistoryByProject: new Map() });
    const store = useAppStore.getState();
    // Restored from the last run: on screen, but never visited in this one.
    store.setLastFile('/p', 'a.ts');
    store.recordFileVisit('/p', { filePath: 'b.ts', lines: null });
    store.setLastFile('/p', 'b.ts');
    store.closeFile('/p', 'b.ts');
    const history = useAppStore.getState().fileHistoryByProject.get('/p');
    expect(history?.visits.map((visit) => visit.filePath)).toEqual(['a.ts', 'b.ts', 'a.ts']);
    expect(useAppStore.getState().stepFileHistory('/p', -1)?.filePath).toBe('b.ts');
  });

  it('keeps the active tab when another one closes', () => {
    const store = useAppStore.getState();
    for (const path of ['a.ts', 'b.ts']) store.setLastFile('/p', path);
    store.closeFile('/p', 'a.ts');
    expect([tabs(), active()]).toEqual([['b.ts'], 'b.ts']);
  });
});

describe('workspace project per session', () => {
  it('keeps the Files/Git project per session without touching the active project', () => {
    useAppStore.setState({
      workspaceProjectBySession: new Map(),
      activeProject: { path: '/project-a', name: 'a' },
    });
    const store = useAppStore.getState();
    store.setWorkspaceProject('/s/a.jsonl', '/project-b');

    expect(useAppStore.getState().workspaceProjectBySession.get('/s/a.jsonl')).toBe('/project-b');
    expect(useAppStore.getState().workspaceProjectBySession.get('/s/b.jsonl')).toBeUndefined();
    expect(useAppStore.getState().activeProject).toEqual({ path: '/project-a', name: 'a' });

    store.setWorkspaceProject('/s/a.jsonl', null);
    expect(useAppStore.getState().workspaceProjectBySession.size).toBe(0);
  });

  it("resolves each session's own choice and falls back when that project is gone", () => {
    const projects = [
      { path: '/project-a', name: 'a' },
      { path: '/project-b', name: 'b' },
    ];
    const state = {
      recentProjects: projects,
      activeProject: projects[0],
      workspaceProjectBySession: new Map([
        ['/s/a.jsonl', '/project-b'],
        ['/s/b.jsonl', '/project-removed'],
      ]),
    };

    expect(workspaceProjectForSession({ ...state, activeSessionPath: '/s/a.jsonl' })).toEqual(
      projects[1],
    );
    expect(workspaceProjectForSession({ ...state, activeSessionPath: '/s/c.jsonl' })).toEqual(
      projects[0],
    );
    expect(workspaceProjectForSession({ ...state, activeSessionPath: '/s/b.jsonl' })).toEqual(
      projects[0],
    );
  });
});

describe('sidebar lineage expansion', () => {
  it('persists collapsed sessions and open subagent groups', () => {
    const store = useAppStore.getState();
    store.setSessionChildrenCollapsed(['/s/a.jsonl', '/s/b.jsonl'], true);
    store.setSessionChildrenCollapsed(['/s/b.jsonl'], false);
    store.setSubagentGroupsExpanded(['/s/a.jsonl'], true);

    expect(JSON.parse(localStorage.getItem(COLLAPSED_SESSION_PARENTS_STORAGE_KEY) ?? '')).toEqual([
      '/s/a.jsonl',
    ]);
    expect(JSON.parse(localStorage.getItem(EXPANDED_SUBAGENT_GROUPS_STORAGE_KEY) ?? '')).toEqual([
      '/s/a.jsonl',
    ]);
  });
});
