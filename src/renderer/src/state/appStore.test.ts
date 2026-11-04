// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LAST_FILE_STORAGE_KEY, QUOTES_STORAGE_KEY, useAppStore } from './appStore';

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
