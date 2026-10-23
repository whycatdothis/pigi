// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './appStore';

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

  it('adds quotes per session and opens the sidebar on the quotes tab', () => {
    const store = useAppStore.getState();
    store.addQuote(activePath, 'first', 'a');
    store.addQuote(activePath, 'second', '');
    store.addQuote(backgroundPath, 'other', 'b');
    expect(quotesOf(activePath)).toEqual(['first|a', 'second|']);
    expect(quotesOf(backgroundPath)).toEqual(['other|b']);
    expect(useAppStore.getState().rightSidebarOpen).toBe(true);
  });

  it('updates and removes a quote by id', () => {
    const store = useAppStore.getState();
    store.addQuote(activePath, 'first', 'a');
    store.addQuote(activePath, 'second', 'b');
    const [first, second] = useAppStore.getState().quotesBySession.get(activePath) ?? [];
    store.updateQuoteComment(activePath, second.id, 'changed');
    store.removeQuote(activePath, first.id);
    expect(quotesOf(activePath)).toEqual(['second|changed']);
  });

  it('drops a session entry once its last quote is gone', () => {
    const store = useAppStore.getState();
    store.addQuote(activePath, 'only', '');
    const [only] = useAppStore.getState().quotesBySession.get(activePath) ?? [];
    store.removeQuote(activePath, only.id);
    expect(useAppStore.getState().quotesBySession.has(activePath)).toBe(false);

    store.addQuote(activePath, 'again', '');
    store.setSessionQuotes(activePath, []);
    expect(useAppStore.getState().quotesBySession.has(activePath)).toBe(false);
  });
});
