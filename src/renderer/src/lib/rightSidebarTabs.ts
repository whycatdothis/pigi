/** Views the right sidebar can show, one tab each. */
export const RIGHT_SIDEBAR_TABS = {
  quotes: 'quotes',
} as const;

export type RightSidebarTab = (typeof RIGHT_SIDEBAR_TABS)[keyof typeof RIGHT_SIDEBAR_TABS];
