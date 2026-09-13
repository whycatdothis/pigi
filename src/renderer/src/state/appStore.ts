import { create } from 'zustand';
import { TERMINAL_DEFAULT_HEIGHT } from '../lib/layoutConstants';
import type {
  ContextUsage,
  ModelInfo,
  PiSessionInfo,
  ProjectDirectory,
  ThinkingLevel,
  UpdateStatus,
} from '../../../shared/ipcContract';
import type { Platform } from '../../../shared/platform';
import { createPersistedSessionMap } from '../lib/persistedSessionMap';
import { parseStoredQuotes, type MessageQuote } from '../lib/messageQuotes';
import { RIGHT_SIDEBAR_TABS, type RightSidebarTab } from '../lib/rightSidebarTabs';
import type { DiagramThemeChoice } from '../lib/mermaidTheme';
import {
  readDiagramThemePreference,
  writeDiagramThemePreference,
} from '../lib/diagramThemePreference';
import type { AgentStatus } from './transcriptController';

export type { AgentStatus };

/** One terminal tab as shown in the panel's tab strip (mirrored from the controller). */
export interface TerminalTabView {
  id: string;
  title: string;
}

export interface SessionEntry {
  sessionPath: string;
  persistedSessionId: string;
  /** The session this one was forked from, when known. The sidebar keeps the
   *  lineage from the listed sessions; this covers a fork that has no file yet
   *  (a fork of the first message, before its first response). */
  parentSessionPath?: string;
  status: AgentStatus;
  title: string;
  cwd: string;
  createdAt: string;
  model: ModelInfo | null;
  thinkingLevel: ThinkingLevel | null;
  contextUsage: ContextUsage | null;
  autoCompactionEnabled: boolean;
  messageCount: number;
  error: string | null;
}

interface AppState {
  // Sessions (keyed by sessionPath)
  sessions: Map<string, SessionEntry>;
  activeSessionPath: string | null;
  // Remembered scroll positions per session (sessionPath -> scrollTop)
  // scrollTop = -1 means "was at bottom, auto-scroll on restore"
  scrollPositions: Map<string, number>;
  setScrollPosition: (sessionPath: string, scrollTop: number) => void;

  recentProjects: ProjectDirectory[];
  activeProject: ProjectDirectory | null;
  projectSessions: Record<string, PiSessionInfo[]>;

  addSession: (sessionPath: string, cwd: string) => void;
  addSessionEntry: (entry: SessionEntry) => void;
  removeSession: (sessionPath: string) => void;
  setActiveSession: (sessionPath: string | null) => void;
  updateSession: (sessionPath: string, updates: Partial<Omit<SessionEntry, 'sessionPath'>>) => void;
  setProjects: (recentProjects: ProjectDirectory[], activeProject: ProjectDirectory | null) => void;
  setProjectSessions: (sessionsByCwd: Record<string, PiSessionInfo[]>) => void;
  setProjectSessionList: (cwd: string, sessions: PiSessionInfo[]) => void;

  // Sidebar
  sidebarExpanded: boolean;
  setSidebarExpanded: (expanded: boolean) => void;
  toggleSidebar: () => void;

  // Bottom terminal panel. `terminalMounted` stays true after first open so the
  // xterm instance (and its PTY) persist while the panel is toggled hidden.
  terminalOpen: boolean;
  terminalMounted: boolean;
  toggleTerminal: () => void;
  setTerminalOpen: (open: boolean) => void;
  // Committed panel height. Live dragging updates the shared layout CSS value
  // directly, then saves the final height here when the gesture ends.
  terminalHeight: number;
  setTerminalHeight: (height: number) => void;
  terminalDragging: boolean;
  setTerminalDragging: (dragging: boolean) => void;
  // Tab strip for the currently-shown project group. The terminal controller is
  // the source of truth and mirrors the active group here so React can render it.
  terminalTabs: TerminalTabView[];
  activeTerminalTabId: string | null;
  setTerminalTabs: (tabs: TerminalTabView[], activeTabId: string | null) => void;

  // Quotes collected from the transcript, per session, waiting to be sent
  // together. Persisted in localStorage, like the chat input drafts.
  quotesBySession: Map<string, MessageQuote[]>;
  addQuote: (sessionPath: string, text: string, comment: string) => void;
  updateQuoteComment: (sessionPath: string, quoteId: string, comment: string) => void;
  removeQuote: (sessionPath: string, quoteId: string) => void;
  setSessionQuotes: (sessionPath: string, quotes: MessageQuote[]) => void;
  /** One comment on all of a session's quotes, sent after them. */
  globalCommentBySession: Map<string, string>;
  /** An empty comment removes it. */
  setGlobalComment: (sessionPath: string, comment: string) => void;

  // Sessions whose right sidebar is open (closed ones are absent), persisted.
  openRightSidebarSessions: Map<string, true>;
  rightSidebarTab: RightSidebarTab;
  setRightSidebarOpen: (sessionPath: string, open: boolean) => void;
  toggleRightSidebar: (sessionPath: string) => void;
  setRightSidebarTab: (tab: RightSidebarTab) => void;

  // Tool block view mode: 'default' shows all cards, 'compact_read' collapses consecutive read-only tools, 'minimal' renders a minimal/codex-style activity view
  toolBlockViewMode: 'default' | 'compact_read' | 'minimal';
  setToolBlockViewMode: (mode: 'default' | 'compact_read' | 'minimal') => void;

  // Theme a diagram is drawn in: 'auto' follows the app's own theme, anything
  // else is a mermaid theme name the reader picked. Kept here rather than in the
  // diagram's own module so a settings page has one place to read and write it.
  diagramTheme: DiagramThemeChoice;
  setDiagramTheme: (choice: DiagramThemeChoice) => void;

  // Platform
  platform: Platform;
  setPlatform: (platform: Platform) => void;

  // Auto-update status, pushed from main. Only 'downloaded' shows UI (the
  // Settings blue dot and its install entry); every other phase is transient.
  updateStatus: UpdateStatus;
  setUpdateStatus: (status: UpdateStatus) => void;

  // Navigation history (sessionPath[] stacks for back/forward)
  navigationBackStack: string[];
  navigationForwardStack: string[];

  /** Call BEFORE changing activeSessionPath to record the current session in history */
  pushNavigationHistory: (sessionPath: string) => void;
  /** Returns target sessionPath or null, updates stacks and activeSessionPath internally */
  navigateBack: () => string | null;
  /** Returns target sessionPath or null, updates stacks and activeSessionPath internally */
  navigateForward: () => string | null;
  /** Remove a session path from all history stacks */
  removeFromNavigationHistory: (sessionPath: string) => void;

  // Sessions whose run finished while the user was viewing another session;
  // cleared when the session is opened. Persisted in localStorage, and kept
  // across process exits (the pool reaps idle background processes).
  unreadSessionPaths: Set<string>;

  // Tracks session paths that were manually renamed (to suppress typewriter animation)
  renamedSessionPaths: Set<string>;
  markSessionRenamed: (sessionPath: string) => void;
  clearSessionRenamed: (sessionPath: string) => void;
}

function isAgentBusy(status: AgentStatus): boolean {
  return status === 'streaming' || status === 'tool_running';
}

const UNREAD_SESSIONS_STORAGE_KEY = 'pigi.unreadSessionPaths';

function loadUnreadSessionPaths(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(UNREAD_SESSIONS_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? new Set(parsed.filter((path): path is string => typeof path === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

export const QUOTES_STORAGE_KEY = 'pigi.quotesBySession';

const storedQuotes = createPersistedSessionMap({
  storageKey: QUOTES_STORAGE_KEY,
  // Quotes change on discrete actions (add, edit, delete, send).
  saveDelayMs: 300,
  parse: parseStoredQuotes,
});

export const GLOBAL_COMMENTS_STORAGE_KEY = 'pigi.globalCommentBySession';

const storedGlobalComments = createPersistedSessionMap<string>({
  storageKey: GLOBAL_COMMENTS_STORAGE_KEY,
  saveDelayMs: 300,
  parse: (value) => (typeof value === 'string' && value.trim() ? value : undefined),
});

export const RIGHT_SIDEBAR_OPEN_STORAGE_KEY = 'pigi.openRightSidebarSessions';

const storedOpenRightSidebars = createPersistedSessionMap<true>({
  storageKey: RIGHT_SIDEBAR_OPEN_STORAGE_KEY,
  saveDelayMs: 300,
  parse: (value) => (value === true ? true : undefined),
});

function withRightSidebarOpen(
  openRightSidebarSessions: Map<string, true>,
  sessionPath: string,
  open: boolean,
): Map<string, true> {
  const next = new Map(openRightSidebarSessions);
  if (open) {
    next.set(sessionPath, true);
  } else {
    next.delete(sessionPath);
  }
  return next;
}

function withSessionQuotes(
  quotesBySession: Map<string, MessageQuote[]>,
  sessionPath: string,
  quotes: MessageQuote[],
): Map<string, MessageQuote[]> {
  const next = new Map(quotesBySession);
  if (quotes.length > 0) {
    next.set(sessionPath, quotes);
  } else {
    next.delete(sessionPath);
  }
  return next;
}

export const useAppStore = create<AppState>((set) => ({
  sessions: new Map(),
  activeSessionPath: null,
  scrollPositions: new Map(),
  setScrollPosition: (sessionPath, scrollTop) =>
    set((state) => {
      const scrollPositions = new Map(state.scrollPositions);
      scrollPositions.set(sessionPath, scrollTop);
      return { scrollPositions };
    }),

  recentProjects: [],
  activeProject: null,
  projectSessions: {},

  addSession: (sessionPath, cwd) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      sessions.set(sessionPath, {
        sessionPath,
        persistedSessionId: '',
        status: 'idle',
        title: 'New chat',
        cwd,
        createdAt: new Date().toISOString(),
        model: null,
        thinkingLevel: null,
        contextUsage: null,
        autoCompactionEnabled: false,
        messageCount: 0,
        error: null,
      });
      return { sessions };
    }),

  addSessionEntry: (entry) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      sessions.set(entry.sessionPath, entry);
      return { sessions };
    }),

  removeSession: (sessionPath) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      sessions.delete(sessionPath);
      const activeSessionPath =
        state.activeSessionPath === sessionPath ? null : state.activeSessionPath;
      return { sessions, activeSessionPath };
    }),

  setActiveSession: (activeSessionPath) =>
    set((state) => {
      if (activeSessionPath === null || !state.unreadSessionPaths.has(activeSessionPath)) {
        return { activeSessionPath };
      }
      const unreadSessionPaths = new Set(state.unreadSessionPaths);
      unreadSessionPaths.delete(activeSessionPath);
      return { activeSessionPath, unreadSessionPaths };
    }),

  updateSession: (sessionPath, updates) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      const existing = sessions.get(sessionPath);
      if (!existing) {
        return { sessions };
      }
      sessions.set(sessionPath, { ...existing, ...updates });
      const finishedUnseen =
        updates.status !== undefined &&
        isAgentBusy(existing.status) &&
        !isAgentBusy(updates.status) &&
        sessionPath !== state.activeSessionPath;
      if (!finishedUnseen || state.unreadSessionPaths.has(sessionPath)) {
        return { sessions };
      }
      const unreadSessionPaths = new Set(state.unreadSessionPaths);
      unreadSessionPaths.add(sessionPath);
      return { sessions, unreadSessionPaths };
    }),

  setProjects: (recentProjects, activeProject) => set({ recentProjects, activeProject }),
  setProjectSessions: (projectSessions) => set({ projectSessions }),
  setProjectSessionList: (cwd, sessions) =>
    set((state) => ({
      projectSessions: {
        ...state.projectSessions,
        [cwd]: sessions,
      },
    })),

  // Sidebar
  sidebarExpanded: true,
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),

  // Bottom terminal panel
  terminalOpen: false,
  terminalMounted: false,
  toggleTerminal: () =>
    set((s) => {
      const terminalOpen = !s.terminalOpen;
      return { terminalOpen, terminalMounted: s.terminalMounted || terminalOpen };
    }),
  setTerminalOpen: (open) =>
    set((s) => ({ terminalOpen: open, terminalMounted: s.terminalMounted || open })),
  terminalHeight: TERMINAL_DEFAULT_HEIGHT,
  setTerminalHeight: (height) => set({ terminalHeight: height }),
  terminalDragging: false,
  setTerminalDragging: (dragging) => set({ terminalDragging: dragging }),
  terminalTabs: [],
  activeTerminalTabId: null,
  setTerminalTabs: (terminalTabs, activeTerminalTabId) =>
    set({ terminalTabs, activeTerminalTabId }),

  // Quotes
  quotesBySession: storedQuotes.load(),
  addQuote: (sessionPath, text, comment) =>
    set((state) => {
      const quote: MessageQuote = { id: crypto.randomUUID(), text, comment };
      const quotes = [...(state.quotesBySession.get(sessionPath) ?? []), quote];
      return {
        quotesBySession: withSessionQuotes(state.quotesBySession, sessionPath, quotes),
        openRightSidebarSessions: withRightSidebarOpen(
          state.openRightSidebarSessions,
          sessionPath,
          true,
        ),
        rightSidebarTab: RIGHT_SIDEBAR_TABS.quotes,
      };
    }),
  updateQuoteComment: (sessionPath, quoteId, comment) =>
    set((state) => {
      const quotes = (state.quotesBySession.get(sessionPath) ?? []).map((quote) =>
        quote.id === quoteId ? { ...quote, comment } : quote,
      );
      return { quotesBySession: withSessionQuotes(state.quotesBySession, sessionPath, quotes) };
    }),
  removeQuote: (sessionPath, quoteId) =>
    set((state) => {
      const quotes = (state.quotesBySession.get(sessionPath) ?? []).filter(
        (quote) => quote.id !== quoteId,
      );
      return { quotesBySession: withSessionQuotes(state.quotesBySession, sessionPath, quotes) };
    }),
  setSessionQuotes: (sessionPath, quotes) =>
    set((state) => ({
      quotesBySession: withSessionQuotes(state.quotesBySession, sessionPath, quotes),
    })),
  globalCommentBySession: storedGlobalComments.load(),
  setGlobalComment: (sessionPath, comment) =>
    set((state) => {
      const globalCommentBySession = new Map(state.globalCommentBySession);
      if (comment) {
        globalCommentBySession.set(sessionPath, comment);
      } else {
        globalCommentBySession.delete(sessionPath);
      }
      return { globalCommentBySession };
    }),

  // Right sidebar
  openRightSidebarSessions: storedOpenRightSidebars.load(),
  rightSidebarTab: RIGHT_SIDEBAR_TABS.quotes,
  setRightSidebarOpen: (sessionPath, open) =>
    set((state) => ({
      openRightSidebarSessions: withRightSidebarOpen(
        state.openRightSidebarSessions,
        sessionPath,
        open,
      ),
    })),
  toggleRightSidebar: (sessionPath) =>
    set((state) => ({
      openRightSidebarSessions: withRightSidebarOpen(
        state.openRightSidebarSessions,
        sessionPath,
        !state.openRightSidebarSessions.has(sessionPath),
      ),
    })),
  setRightSidebarTab: (tab) => set({ rightSidebarTab: tab }),

  // Tool block view mode
  toolBlockViewMode: 'compact_read',

  setToolBlockViewMode: (mode) => set({ toolBlockViewMode: mode }),

  diagramTheme: readDiagramThemePreference(),
  setDiagramTheme: (choice) => {
    writeDiagramThemePreference(choice);
    set({ diagramTheme: choice });
  },

  // Platform
  platform: 'unknown',
  setPlatform: (platform) => set({ platform }),

  // Auto-update
  updateStatus: { phase: 'idle' },
  setUpdateStatus: (status) => set({ updateStatus: status }),

  // Navigation history
  navigationBackStack: [],
  navigationForwardStack: [],

  pushNavigationHistory: (sessionPath) =>
    set((state) => {
      if (sessionPath === state.activeSessionPath) return {};
      // Remove target from backStack to avoid duplicates when toggling
      // between sessions (e.g. Ctrl+Tab D↔C keeps backStack clean).
      // .filter() creates a new array required by Zustand's immutability.
      const backStack = state.navigationBackStack.filter((p) => p !== sessionPath);
      if (state.activeSessionPath) {
        backStack.push(state.activeSessionPath);
      }
      return {
        navigationBackStack: backStack,
        navigationForwardStack: [],
      };
    }),

  navigateBack: () => {
    let targetPath: string | null = null;
    set((state) => {
      if (state.navigationBackStack.length === 0) return {};
      const nextBackStack = [...state.navigationBackStack];
      targetPath = nextBackStack.pop()!;
      const nextForwardStack = [...state.navigationForwardStack];
      if (state.activeSessionPath && !nextForwardStack.includes(state.activeSessionPath)) {
        nextForwardStack.push(state.activeSessionPath);
      }
      return {
        navigationBackStack: nextBackStack,
        navigationForwardStack: nextForwardStack,
      };
    });
    return targetPath;
  },

  navigateForward: () => {
    let targetPath: string | null = null;
    set((state) => {
      if (state.navigationForwardStack.length === 0) return {};
      const nextForwardStack = [...state.navigationForwardStack];
      targetPath = nextForwardStack.pop()!;
      const nextBackStack = [...state.navigationBackStack];
      if (state.activeSessionPath && !nextBackStack.includes(state.activeSessionPath)) {
        nextBackStack.push(state.activeSessionPath);
      }
      return {
        navigationBackStack: nextBackStack,
        navigationForwardStack: nextForwardStack,
      };
    });
    return targetPath;
  },

  removeFromNavigationHistory: (sessionPath) =>
    set((state) => ({
      navigationBackStack: state.navigationBackStack.filter((p) => p !== sessionPath),
      navigationForwardStack: state.navigationForwardStack.filter((p) => p !== sessionPath),
    })),

  unreadSessionPaths: loadUnreadSessionPaths(),

  renamedSessionPaths: new Set(),
  markSessionRenamed: (sessionPath) =>
    set((state) => {
      const next = new Set(state.renamedSessionPaths);
      next.add(sessionPath);
      return { renamedSessionPaths: next };
    }),
  clearSessionRenamed: (sessionPath) =>
    set((state) => {
      const next = new Set(state.renamedSessionPaths);
      next.delete(sessionPath);
      return { renamedSessionPaths: next };
    }),
}));

useAppStore.subscribe((state, previous) => {
  if (state.unreadSessionPaths !== previous.unreadSessionPaths) {
    localStorage.setItem(
      UNREAD_SESSIONS_STORAGE_KEY,
      JSON.stringify([...state.unreadSessionPaths]),
    );
  }
  if (state.quotesBySession !== previous.quotesBySession) {
    storedQuotes.save(state.quotesBySession);
  }
  if (state.globalCommentBySession !== previous.globalCommentBySession) {
    storedGlobalComments.save(state.globalCommentBySession);
  }
  if (state.openRightSidebarSessions !== previous.openRightSidebarSessions) {
    storedOpenRightSidebars.save(state.openRightSidebarSessions);
  }
});
