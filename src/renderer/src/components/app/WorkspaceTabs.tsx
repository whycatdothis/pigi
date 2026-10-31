import { memo } from 'react';
import { IconFolder, IconGitCompare, IconMessageCircle } from '@tabler/icons-react';
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
    icon: IconFolder,
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
  icon: typeof IconMessageCircle;
}[];

/**
 * The main window's fixed views. The shortcut keycap sits in the layout at
 * rest and only becomes visible on hover/focus, so revealing it never moves
 * the other tabs.
 */
const WorkspaceTabs = memo(function WorkspaceTabs({
  value,
  onChange,
  shortcutBindings,
  chatTitle,
  className,
}: {
  value: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  shortcutBindings: Map<string, ShortcutBinding> | null;
  /** The open session's title, shown in the Chat tab instead of the word "Chat". */
  chatTitle?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (isWorkspaceTab(next)) onChange(next);
      }}
      className={cn('gap-0', className)}
    >
      <TabsList variant="chip" className="[-webkit-app-region:no-drag]">
        {TAB_ITEMS.map(({ tab, label: defaultLabel, shortcutId, icon: Icon }) => {
          const label =
            tab === WORKSPACE_TABS.chat && chatTitle?.trim() ? chatTitle.trim() : defaultLabel;
          const binding = shortcutBindings?.get(shortcutId);
          return (
            <TabsTrigger
              key={tab}
              value={tab}
              aria-label={
                binding ? `${label} tab (${formatShortcutLabel(binding)})` : `${label} tab`
              }
              className={cn(
                'group/tab h-7 flex-none gap-1.5 px-2.5 text-caption font-normal text-muted-foreground',
                tab === WORKSPACE_TABS.chat &&
                  chatTitle?.trim() &&
                  // The session title caps at 33% of the toolbar; 2/3 of that is
                  // about 208px at the default window.
                  'max-w-52 min-w-36 justify-start',
              )}
            >
              <Icon size={13} className="opacity-70" />
              <span className="min-w-0 truncate">{label}</span>
              {binding && (
                <Kbd
                  className={cn(
                    COMPACT_KBD_CLASS_NAME,
                    'shrink-0 opacity-0 transition-opacity group-hover/tab:opacity-100 group-focus-visible/tab:opacity-100',
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
        'flex h-11 shrink-0 items-center gap-2 border-b-[0.5px] border-foreground/27 px-3 transition-[padding] [-webkit-app-region:drag]',
        SIDEBAR_TRANSITION_CLASS_NAME,
      )}
      style={{ paddingLeft: titleInset }}
    >
      <WorkspaceTabs
        value={workspaceTab}
        onChange={onSelectWorkspaceTab}
        shortcutBindings={shortcutBindings}
        chatTitle={title}
        className="shrink-0"
      />
      <div className="flex-1" />
    </div>
  );
});
