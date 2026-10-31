import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { IconGitCompare, IconMessageCircle } from '@tabler/icons-react';
import { FolderClosed } from 'lucide-react';
import type { ShortcutBinding } from '../../../../shared/ipcContract';
import { WORKSPACE_TABS, isWorkspaceTab, type WorkspaceTab } from '../../lib/workspaceTabs';
import { cn } from '../../lib/utils';
import { SIDEBAR_TRANSITION_CLASS_NAME } from '../../lib/layoutConstants';
import { formatShortcutLabel } from '../../shortcuts/formatShortcutLabel';
import { COMPACT_KBD_CLASS_NAME, Kbd } from '../ui/kbd';
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
    icon: FolderClosed,
  },
  {
    tab: WORKSPACE_TABS.diff,
    label: 'Diff',
    shortcutId: 'workspace.diff',
    icon: IconGitCompare,
  },
] as const satisfies readonly {
  tab: WorkspaceTab;
  label: string;
  shortcutId: string;
  icon: typeof IconMessageCircle | typeof FolderClosed;
}[];

/**
 * The main window's fixed views. The shortcut keycap sits in the layout at
 * rest and only becomes visible on hover/focus, so revealing it never moves
 * the other tabs. The @max breakpoints are container widths, not viewport
 * widths: keycaps leave and the Chat tab's 144px floor drops at 600px so its
 * title truncates instead of pushing Files/Diff out; at 320px labels leave and
 * the Chat chip drops its 240px preferred width, so all three icon tabs take
 * about 110px. The list itself is max-w-full:
 * w-fit alone keeps it at max-content, which would make the Chat chip's shrink
 * dead code and paint the overflow into the header spacer. SessionToolbar
 * moves its secondary actions into an overflow menu at 430px for the same
 * reason.
 */
const WorkspaceTabs = memo(function WorkspaceTabs({
  value,
  onChange,
  shortcutBindings,
  chatTitle,
  chatRenameTitle,
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

  // Container thresholds are main-area widths, not viewport widths: below 600
  // the chat chip may shrink and the keycaps go, and below 320 the tabs become
  // icon-only. The header, not this strip, is the container.
  useEffect(() => {
    if (isRenamingChat || !restoreChatFocusRef.current) return;
    restoreChatFocusRef.current = false;
    chatTabRef.current?.focus();
  }, [isRenamingChat]);

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
          const label =
            tab === WORKSPACE_TABS.chat && chatTitle?.trim() ? chatTitle.trim() : defaultLabel;
          const binding = shortcutBindings?.get(shortcutId);
          const canRename = tab === WORKSPACE_TABS.chat && Boolean(onRenameChat && chatName);
          if (tab === WORKSPACE_TABS.chat && isRenamingChat) {
            return (
              <div
                key={tab}
                className={cn(
                  'group/tab flex h-7 w-full max-w-60 min-w-0 items-center gap-1.5 rounded-control-sm px-2.5 text-caption font-normal @max-[320px]:px-2 @max-[220px]:px-1',
                  value === WORKSPACE_TABS.chat
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                <Icon size={13} className="opacity-70" />
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
              ref={tab === WORKSPACE_TABS.chat ? chatTabRef : undefined}
              value={tab}
              title={tab === WORKSPACE_TABS.chat ? label : undefined}
              aria-label={
                binding ? `${label} tab (${formatShortcutLabel(binding)})` : `${label} tab`
              }
              onDoubleClick={canRename ? handleStartRename : undefined}
              className={cn(
                'group/tab h-7 gap-1.5 px-2.5 text-caption font-normal text-muted-foreground @max-[320px]:px-2 @max-[220px]:px-1',
                tab === WORKSPACE_TABS.chat
                  ? 'shrink basis-auto w-60 min-w-36 justify-start @max-[600px]:min-w-0 @max-[320px]:w-auto @max-[320px]:flex-none'
                  : 'flex-none',
                isRenamingChat && tab !== WORKSPACE_TABS.chat && '@max-[320px]:hidden',
              )}
            >
              <Icon size={13} className="opacity-70" />
              <span className="min-w-0 truncate @max-[320px]:hidden">{label}</span>
              {binding && (
                <Kbd
                  className={cn(
                    COMPACT_KBD_CLASS_NAME,
                    'shrink-0 opacity-0 transition-opacity group-hover/tab:opacity-100 group-focus-visible/tab:opacity-100 @max-[600px]:hidden',
                  )}
                >
                  {formatShortcutLabel(binding)}
                </Kbd>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
});

export default WorkspaceTabs;

/** Header for a no-session Files/Diff view, where the tabs are still needed to leave it. */
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
        'flex h-11 shrink-0 items-center gap-2 border-b-[0.5px] border-foreground/27 px-3 transition-[padding] @container @max-[320px]:px-2 @max-[220px]:px-1 [-webkit-app-region:drag]',
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
