/**
 * Dev-only `window.__pigi` handle so CDP scripts (scripts/cdp.mjs) can read
 * app state directly instead of reverse-engineering it from the DOM.
 * Installed from main.tsx only when import.meta.env.DEV.
 */
import { useAppStore } from '../state/appStore';
import type { TranscriptController } from '../state/transcriptController';
import { getTranscriptController } from '../hooks/useTranscript';

interface PigiDebugHandle {
  appStore: typeof useAppStore;
  /** Transcript controller for a session (defaults to the active session). */
  transcript: (sessionPath?: string) => TranscriptController | null;
  /** Compact summary of the state that matters most while debugging. */
  snapshot: () => Record<string, unknown>;
}

declare global {
  interface Window {
    __pigi?: PigiDebugHandle;
  }
}

function transcript(sessionPath?: string): TranscriptController | null {
  const path = sessionPath ?? useAppStore.getState().activeSessionPath;
  return path ? getTranscriptController(path) : null;
}

function snapshot(): Record<string, unknown> {
  const state = useAppStore.getState();
  const controller = transcript();
  const transcriptState = controller?.state;
  return {
    activeProject: state.activeProject?.path ?? null,
    activeSessionPath: state.activeSessionPath,
    sessions: Array.from(state.sessions.values()).map((session) => ({
      sessionPath: session.sessionPath,
      status: session.status,
      title: session.title,
      model: session.model ? `${session.model.provider}/${session.model.id}` : null,
      messageCount: session.messageCount,
      error: session.error,
    })),
    sidebarExpanded: state.sidebarExpanded,
    terminalOpen: state.terminalOpen,
    toolBlockViewMode: state.toolBlockViewMode,
    transcript: transcriptState
      ? {
          status: transcriptState.status,
          nodeCount: transcriptState.nodes.length,
          nodeRoles: transcriptState.nodes.reduce<Record<string, number>>((counts, node) => {
            counts[node.role] = (counts[node.role] ?? 0) + 1;
            return counts;
          }, {}),
          activeAssistantId: transcriptState.activeAssistantId,
          activeToolCallId: transcriptState.activeToolCallId,
          queuedSteering: transcriptState.queuedSteering.length,
          queuedFollowUp: transcriptState.queuedFollowUp.length,
          isCompacting: transcriptState.isCompacting,
        }
      : null,
  };
}

export function installDebugHandle(): void {
  window.__pigi = { appStore: useAppStore, transcript, snapshot };
}
