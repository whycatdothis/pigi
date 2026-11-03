/** Views the main window can show. Tabs are fixed; each has a shortcut. */
export const WORKSPACE_TABS = {
  chat: 'chat',
  files: 'files',
  git: 'git',
} as const;

export type WorkspaceTab = (typeof WORKSPACE_TABS)[keyof typeof WORKSPACE_TABS];

export function isWorkspaceTab(value: string): value is WorkspaceTab {
  return Object.hasOwn(WORKSPACE_TABS, value);
}
