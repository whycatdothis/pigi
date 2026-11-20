import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { IconLoader2, IconMessageCircle } from '@tabler/icons-react';
import { FolderOpen, GitBranch } from 'lucide-react';
import type { ShortcutBinding } from '../../../../shared/ipcContract';
import { WORKSPACE_TABS, isWorkspaceTab, type WorkspaceTab } from '../../lib/workspaceTabs';
import { cn } from '../../lib/utils';
import { SIDEBAR_TRANSITION_CLASS_NAME } from '../../lib/layoutConstants';
import { formatShortcutLabel } from '../../shortcuts/formatShortcutLabel';
import { COMPACT_KBD_CLASS_NAME, Kbd } from '../ui/kbd';
import { SpinningIcon } from '../ui/spinningIcon';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';

const TAB_ITEMS = [
  {
    tab: WORKSPACE_TABS.chat,
    label: 'Chat',
    shortcutId: 'workspace.chat',
    icon: IconMessageCircle,
  },
  {
    tab: WORKSPACE_TABS.files,
    label: 'Files',
    shortcutId: 'workspace.files',
    icon: FolderOpen,
  },
  {
    tab: WORKSPACE_TABS.git,
    label: 'Git',
    shortcutId: 'workspace.git',
    icon: GitBranch,
  },
] as const satisfies readonly {
  tab: WorkspaceTab;
  label: string;
  shortcutId: string;
  icon: typeof IconMessageCircle | typeof FolderOpen;
}[];

/** A header chip tab; the right sidebar's tabs use it too, so both headers match. */
export const HEADER_TAB_CLASS_NAME =
  'follows-text-size-capped h-8 gap-1.5 px-3 text-ui font-normal text-foreground dark:text-foreground';

const TAB_CLASS_NAME = `${HEADER_TAB_CLASS_NAME} @max-[320px]:px-2 @max-[220px]:px-1`;

// The header has no left padding of its own; Chat's left margin keeps the
// active chip off the header edge, and the title sits where it does unselected.
// At the default text size, 312px plus the 8px margin is the 320px Chat takes.
const CHAT_TAB_CLASS_NAME =
  'ml-2 pl-2 text-body w-78 min-w-36 shrink basis-auto justify-start @max-[600px]:min-w-0 @max-[320px]:w-auto @max-[320px]:flex-none';

/**
 * The main window's fixed views. Chat carries no icon so its title gets the
 * room, at a fixed width (320px at the default text size) so Files and Git
 * keep their place whatever the title.
 * Every tab reserves room for its keycap, shown on hover or focus; Chat's slot
 * also holds the agent's status while another tab is open, so the title never
 * shifts when it appears. The
 * @max breakpoints are container (header) widths, not viewport widths: below
 * 600px Chat may shrink and the keycaps go, at 500px Files and Git drop their labels, at 320px Chat
 * swaps its title for an icon, and at 220px padding tightens.
 */
const WorkspaceTabs = memo(function WorkspaceTabs({
  value,
  onChange,
  shortcutBindings,
  chatTitle,
  chatRenameTitle,
  chatActivity = null,
  onRenameChat,
  className,
}: {
  value: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  shortcutBindings: Map<string, ShortcutBinding> | null;
  /** The open session's title, shown in the Chat tab instead of the word "Chat". */
  chatTitle?: string;
  /** The unanimated title to start a rename from, while the tab shows `chatTitle`. */
  chatRenameTitle?: string;
  /** Shown in the Chat tab's keycap slot while another tab is open: the agent is running, or finished unseen. */
  chatActivity?: 'running' | 'unread' | null;
  onRenameChat?: (name: string) => void;
  className?: string;
}): React.JSX.Element {
  const [isRenamingChat, setIsRenamingChat] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const chatTabRef = useRef<HTMLButtonElement>(null);
  const restoreChatFocusRef = useRef(false);
  const chatName = (chatRenameTitle?.trim() || chatTitle?.trim()) ?? '';

  const handleStartRename = useCallback(() => {
    if (!onRenameChat || !chatName) return;
    setRenameValue(chatName);
    setIsRenamingChat(true);
  }, [chatName, onRenameChat]);

  const handleFinishRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== chatName) {
      onRenameChat?.(trimmed);
    }
    setIsRenamingChat(false);
  }, [chatName, onRenameChat, renameValue]);

  const handleRenameKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.nativeEvent.isComposing || event.key === 'Process') {
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        restoreChatFocusRef.current = true;
        handleFinishRename();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        restoreChatFocusRef.current = true;
        setIsRenamingChat(false);
      }
    },
    [handleFinishRename],
  );

  useEffect(() => {
    if (isRenamingChat || !restoreChatFocusRef.current) return;
    restoreChatFocusRef.current = false;
    chatTabRef.current?.focus();
  }, [isRenamingChat]);

  const chatStatus =
    value === WORKSPACE_TABS.chat ? null : chatActivity === 'running' ? (
      <SpinningIcon className="animate-[spin_1.8s_linear_infinite]">
        <IconLoader2 size={14} aria-label="Running" />
      </SpinningIcon>
    ) : chatActivity === 'unread' ? (
      <span
        role="status"
        aria-label="Finished"
        className="size-2 shrink-0 rounded-full bg-[var(--system-accent)]"
      />
    ) : null;

  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (isWorkspaceTab(next)) onChange(next);
      }}
      className={cn('min-w-0 gap-0', className)}
    >
      <TabsList
        variant="chip"
        className="max-w-full min-w-0 @max-[220px]:gap-0 [-webkit-app-region:no-drag]"
      >
        {TAB_ITEMS.map(({ tab, label: defaultLabel, shortcutId, icon: Icon }) => {
          const isChat = tab === WORKSPACE_TABS.chat;
          const label = isChat && chatTitle?.trim() ? chatTitle.trim() : defaultLabel;
          const binding = shortcutBindings?.get(shortcutId);
          const canRename = isChat && Boolean(onRenameChat && chatName);
          if (isChat && isRenamingChat) {
            return (
              <div
                key={tab}
                className={cn(
                  TAB_CLASS_NAME,
                  CHAT_TAB_CLASS_NAME,
                  'flex items-center rounded-control-sm',
                  'text-foreground',
                  value === WORKSPACE_TABS.chat && 'bg-muted',
                )}
              >
                <input
                  type="text"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={handleFinishRename}
                  onKeyDown={handleRenameKeyDown}
                  aria-label="Rename chat"
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent outline-none caret-foreground"
                />
              </div>
            );
          }
          return (
            <TabsTrigger
              key={tab}
              ref={isChat ? chatTabRef : undefined}
              value={tab}
              title={isChat ? label : undefined}
              aria-label={
                binding ? `${label} tab (${formatShortcutLabel(binding)})` : `${label} tab`
              }
              onDoubleClick={canRename ? handleStartRename : undefined}
              className={cn(
                'group/tab',
                TAB_CLASS_NAME,
                isChat ? CHAT_TAB_CLASS_NAME : 'flex-none',
                isRenamingChat && !isChat && '@max-[320px]:hidden',
              )}
            >
              <Icon size={16} className={isChat ? 'hidden @max-[320px]:inline' : undefined} />
              <span
                className={cn(
                  'min-w-0 truncate',
                  isChat ? '@max-[320px]:hidden' : '@max-[500px]:hidden',
                )}
              >
                {label}
              </span>
              {(binding || (isChat && chatStatus)) && (
                <span className={cn('grid shrink-0 place-items-center', isChat && 'ml-auto')}>
                  {binding && (
                    <Kbd
                      className={cn(
                        COMPACT_KBD_CLASS_NAME,
                        '[grid-area:1/1] opacity-0 transition-opacity group-hover/tab:opacity-100 group-focus-visible/tab:opacity-100 @max-[600px]:hidden',
                      )}
                    >
                      {formatShortcutLabel(binding)}
                    </Kbd>
                  )}
                  {isChat && chatStatus && (
                    <span
                      className={cn(
                        'flex [grid-area:1/1] transition-opacity',
                        binding &&
                          // Below 600px the keycap is hidden, so the status stays.
                          'group-hover/tab:opacity-0 group-focus-visible/tab:opacity-0 @max-[600px]:group-hover/tab:opacity-100 @max-[600px]:group-focus-visible/tab:opacity-100',
                      )}
                    >
                      {chatStatus}
                    </span>
                  )}
                </span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
});

export default WorkspaceTabs;

/** Header for a no-session Files/Git view, where the tabs are still needed to leave it. */
export const WorkspaceHeader = memo(function WorkspaceHeader({
  title,
  workspaceTab,
  onSelectWorkspaceTab,
  shortcutBindings,
  titleInset,
}: {
  title: string;
  workspaceTab: WorkspaceTab;
  onSelectWorkspaceTab: (tab: WorkspaceTab) => void;
  shortcutBindings: Map<string, ShortcutBinding> | null;
  titleInset?: number;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex h-11 shrink-0 items-center gap-2 border-b-[0.5px] border-foreground/27 pr-3 transition-[padding] @container @max-[320px]:pr-2 @max-[220px]:pr-1 [-webkit-app-region:drag]',
        SIDEBAR_TRANSITION_CLASS_NAME,
      )}
      style={{ paddingLeft: titleInset }}
    >
      <WorkspaceTabs
        value={workspaceTab}
        onChange={onSelectWorkspaceTab}
        shortcutBindings={shortcutBindings}
        chatTitle={title}
        className="min-w-0 shrink"
      />
      <div className="flex-1" />
    </div>
  );
});
