// Tailwind strings copied from the app. scripts/checkAppClassDrift.mjs checks
// every class still exists in the files named by `source` and `alsoFrom`.
// There is no tailwind-merge here, so classes a call site overrides are left
// out of the copy instead of being left to stylesheet order.

const UI = 'src/renderer/src/components/ui';
const RENDERER = 'src/renderer/src/components';

interface CopiedClasses {
  classes: string;
  source: string;
  alsoFrom?: string[];
  // This page's own classes; the drift check skips them.
  siteClasses?: string[];
}

// Without the app's [-webkit-app-region:no-drag], which means nothing on a page.
export const TOOLBAR_BUTTON = {
  classes:
    'flex items-center justify-center rounded p-1 transition-colors size-7 hover:bg-muted text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
  source: `${RENDERER}/session/SessionToolbar.tsx`,
} satisfies CopiedClasses;

export const TOOLBAR_BUTTON_ON = {
  classes: 'text-foreground',
  source: `${RENDERER}/session/SessionToolbar.tsx`,
} satisfies CopiedClasses;

// Size is set per call site. Add data-slot="kbd" for the tooltip's kbd padding.
export const KBD = {
  classes:
    'pointer-events-none inline-flex w-fit items-center justify-center gap-1 rounded-inline border border-foreground/10 bg-muted px-1 font-sans font-normal text-muted-foreground select-none',
  source: `${UI}/kbd.tsx`,
} satisfies CopiedClasses;

export const BUTTON_BASE = {
  classes:
    "group/button inline-flex shrink-0 items-center justify-center rounded-control border bg-clip-padding font-normal whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  source: `${UI}/button.tsx`,
} satisfies CopiedClasses;

export const BUTTON_FILLED = {
  classes: 'border-transparent bg-primary text-primary-foreground hover:bg-primary-hover',
  source: `${UI}/button.tsx`,
} satisfies CopiedClasses;

export const BUTTON_OUTLINE = {
  classes:
    'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
  source: `${UI}/button.tsx`,
} satisfies CopiedClasses;

export const BUTTON_BRAND_FILLED = {
  classes:
    'border-transparent bg-[var(--brand)] text-[var(--brand-ink)] [a]:hover:bg-[var(--brand)]/85',
  source: `${UI}/button.tsx`,
  siteClasses: ['bg-[var(--brand)]', 'text-[var(--brand-ink)]', '[a]:hover:bg-[var(--brand)]/85'],
} satisfies CopiedClasses;

export const BUTTON_HERO_SIZE = {
  classes: 'h-12 gap-2.5 px-5 text-body',
  source: `${UI}/button.tsx`,
  siteClasses: ['h-12', 'gap-2.5', 'px-5'],
} satisfies CopiedClasses;

// The app's Radix portal and delay are replaced by .app-tooltip.
export const TOOLTIP_CONTENT = {
  classes:
    'z-50 inline-flex w-fit max-w-xs items-center gap-1.5 text-caption has-data-[slot=kbd]:pr-1.5 rounded-control-sm bg-popover px-2.5 py-1.5 text-popover-foreground shadow-md ring-[0.5px] ring-foreground/25',
  source: `${UI}/tooltip.tsx`,
} satisfies CopiedClasses;

export const MENU_CONTENT = {
  classes:
    'z-50 overflow-x-hidden overflow-y-auto text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 rounded-surface w-fit min-w-0 bg-popover/50 backdrop-blur-md',
  source: `${UI}/dropdown-menu.tsx`,
  alsoFrom: [`${RENDERER}/session/SessionToolbar.tsx`],
} satisfies CopiedClasses;

export const MENU_ITEM = {
  classes:
    "relative flex cursor-default items-center outline-hidden select-none data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 gap-1 rounded-control pl-2 pr-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-[state=checked]:bg-accent-subtle data-[state=checked]:text-[var(--system-accent)] data-[state=checked]:hover:bg-accent-subtle data-[state=checked]:hover:text-[var(--system-accent)] data-[state=checked]:focus:bg-accent-subtle data-[state=checked]:focus:text-[var(--system-accent)] data-[state=checked]:focus:**:text-[var(--system-accent)] py-1 text-caption",
  source: `${UI}/dropdown-menu.tsx`,
  alsoFrom: [`${UI}/selectionStyles.ts`],
} satisfies CopiedClasses;

export const SLASH_MENU_SURFACE = {
  classes:
    'rounded-surface bg-popover/50 backdrop-blur-sm p-1 text-body text-popover-foreground shadow-md outline-[0.5px] outline-foreground/25',
  source: 'src/renderer/src/lib/layoutConstants.ts',
  alsoFrom: [`${RENDERER}/chatInput/slashCommandPopover.tsx`],
} satisfies CopiedClasses;

export const SLASH_MENU_ITEM = {
  classes: 'flex w-full items-center gap-2 rounded-control px-2 py-1 text-left text-ui',
  source: `${RENDERER}/chatInput/slashCommandPopover.tsx`,
} satisfies CopiedClasses;

// --dialog-solid stands in for the app's translucent bg-popover/88 + blur:
// a page has nothing behind it to blur.
export const DIALOG_SURFACE = {
  classes:
    'rounded-surface text-body text-popover-foreground shadow-md outline-[0.5px] outline-foreground/25 bg-[var(--dialog-solid)]',
  source: 'src/renderer/src/lib/layoutConstants.ts',
  siteClasses: ['bg-[var(--dialog-solid)]'],
} satisfies CopiedClasses;

export const TERMINAL_TABS = {
  classes:
    'group/tabs-list inline-flex w-fit items-center justify-center rounded-control gap-1 bg-transparent p-0 text-muted-foreground',
  source: `${UI}/tabs.tsx`,
} satisfies CopiedClasses;

export const TERMINAL_TAB = {
  classes:
    'group/tab relative inline-flex items-center justify-center gap-1.5 border border-transparent whitespace-nowrap text-foreground/60 transition-all hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=chip]/tabs-list:rounded-control-sm group-data-[variant=chip]/tabs-list:data-[state=active]:bg-muted group-data-[variant=chip]/tabs-list:data-[state=active]:shadow-none data-[state=active]:text-foreground h-8 max-w-40 flex-none px-2.5 text-caption font-normal text-muted-foreground',
  source: `${UI}/tabs.tsx`,
  alsoFrom: [`${RENDERER}/terminal/TerminalPanel.tsx`],
} satisfies CopiedClasses;

export const TERMINAL_TAB_CLOSE = {
  classes:
    '-mr-1 ml-0.5 flex size-3.5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-foreground/10 group-hover/tab:opacity-100 group-data-[state=active]/tab:opacity-100',
  source: `${RENDERER}/terminal/TerminalPanel.tsx`,
} satisfies CopiedClasses;

// backdrop-blur-md comes from UserMessageMiniMap.tsx, not the OVERLAY_BG constant.
export const OVERLAY_BG = {
  classes: 'bg-popover/40 backdrop-blur-md',
  source: 'src/renderer/src/lib/layoutConstants.ts',
  siteClasses: ['backdrop-blur-md'],
} satisfies CopiedClasses;

export const ACTION_BUTTON = {
  classes:
    'flex items-center justify-center rounded-inline p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
  source: `${RENDERER}/message/messageBubbles.tsx`,
} satisfies CopiedClasses;

// Without InputGroup's has-[[data-slot=…]] focus selectors.
export const CHAT_CARD = {
  classes:
    'relative h-auto flex-col border bg-background dark:bg-background shadow-composer [--input-group-radius:var(--radius-surface-xl)] rounded-[var(--input-group-radius,var(--radius-control))]',
  source: `${RENDERER}/chatInput/index.tsx`,
  alsoFrom: [`${UI}/input-group.tsx`],
} satisfies CopiedClasses;

export const SIDEBAR_MENU_BUTTON = {
  classes:
    'flex w-full items-center gap-1.5 overflow-hidden rounded-control p-2 text-left text-body outline-hidden hover:bg-primary/5 hover:text-sidebar-accent-foreground data-active:bg-primary/10 data-active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate h-8',
  source: `${UI}/sidebar.tsx`,
} satisfies CopiedClasses;

export const SESSION_ROW = {
  classes:
    'flex h-7 min-w-0 items-center gap-1.5 overflow-hidden rounded-control px-2 outline-hidden hover:bg-primary/5 hover:text-sidebar-accent-foreground data-active:bg-primary/10 data-active:text-sidebar-accent-foreground w-full justify-start pl-6 text-left text-sidebar-foreground/85',
  source: `${UI}/sidebar.tsx`,
  alsoFrom: [`${RENDERER}/sidebar/sessionList.tsx`],
} satisfies CopiedClasses;

export const SESSION_COLLAPSE_TOGGLE = {
  classes:
    'absolute left-1 top-1/2 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded-control text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
  source: `${RENDERER}/sidebar/sessionList.tsx`,
} satisfies CopiedClasses;

export const CHIP_TABS = {
  classes:
    'group/tabs-list inline-flex w-fit items-center justify-center rounded-control text-muted-foreground gap-1 bg-transparent p-0',
  source: `${UI}/tabs.tsx`,
} satisfies CopiedClasses;

export const CHIP_TAB = {
  classes:
    "relative inline-flex items-center rounded-control-sm border border-transparent py-0.5 whitespace-nowrap transition-all hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 group-data-[variant=chip]/tabs-list:data-[state=active]:bg-muted dark:group-data-[variant=chip]/tabs-list:data-[state=active]:bg-muted h-8 gap-1.5 px-3 font-normal text-foreground",
  source: `${UI}/tabs.tsx`,
  alsoFrom: [`${RENDERER}/app/WorkspaceTabs.tsx`],
} satisfies CopiedClasses;

export const PACKAGES_TAB = {
  classes:
    'relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-control-sm border border-transparent px-3 py-0.5 text-body font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=chip]/tabs-list:data-[state=active]:bg-muted dark:group-data-[variant=chip]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=chip]/tabs-list:data-[state=active]:bg-muted data-[state=active]:text-foreground dark:data-[state=active]:text-foreground',
  source: `${UI}/tabs.tsx`,
  alsoFrom: [`${RENDERER}/packages/PackagesPage.tsx`],
} satisfies CopiedClasses;

export const TREE_ROW = {
  classes:
    'flex h-7 w-full items-center gap-1.5 rounded-control pr-2 text-left text-body transition-colors',
  source: `${RENDERER}/files/FileTreeSidebar.tsx`,
  alsoFrom: [`${RENDERER}/git/GitSidebar.tsx`],
} satisfies CopiedClasses;

export const TREE_ROW_IDLE = {
  classes: 'text-sidebar-foreground/80 hover:bg-primary/5 hover:text-accent-foreground',
  source: `${RENDERER}/files/FileTreeSidebar.tsx`,
} satisfies CopiedClasses;

export const TREE_ROW_SELECTED = {
  classes: 'bg-accent-subtle text-[var(--system-accent)]',
  source: `${RENDERER}/files/FileTreeSidebar.tsx`,
} satisfies CopiedClasses;

export const SEGMENTED = {
  classes: 'flex h-6 shrink-0 items-center gap-0.5 rounded-control bg-muted p-0.5',
  source: `${RENDERER}/files/FileViewer.tsx`,
  alsoFrom: [`${RENDERER}/git/SegmentedToggle.tsx`],
} satisfies CopiedClasses;

export const SEGMENTED_ITEM = {
  classes: 'h-5 rounded-control-sm px-2.5 text-caption leading-none transition-colors',
  source: `${RENDERER}/files/FileViewer.tsx`,
} satisfies CopiedClasses;

export const SEGMENTED_ITEM_ON = {
  classes: 'bg-background text-foreground shadow-xs',
  source: `${RENDERER}/files/FileViewer.tsx`,
} satisfies CopiedClasses;

export const SEGMENTED_ITEM_OFF = {
  classes: 'text-muted-foreground hover:text-foreground',
  source: `${RENDERER}/files/FileViewer.tsx`,
} satisfies CopiedClasses;

export const QUOTE_CARD = {
  classes:
    'group relative flex flex-col gap-2 rounded-surface-sm bg-muted/50 p-2.5 ring-[0.5px] ring-foreground/10',
  source: `${RENDERER}/quotes/QuotePanel.tsx`,
} satisfies CopiedClasses;

export const QUOTE_SELECTION_BUTTON = {
  classes:
    'absolute z-20 flex h-7 items-center gap-1.5 rounded-control bg-popover/88 px-2.5 text-caption font-medium text-popover-foreground shadow-md ring-[0.5px] ring-foreground/25 backdrop-blur-sm transition-colors hover:bg-muted/88',
  source: `${RENDERER}/quotes/QuoteSelectionPopover.tsx`,
} satisfies CopiedClasses;

export const PACKAGE_CARD = {
  classes:
    'relative flex min-w-0 gap-3.5 rounded-surface-lg border border-border bg-card p-4 transition-colors hover:bg-muted/40',
  source: `${RENDERER}/packages/packageCards.tsx`,
} satisfies CopiedClasses;

export const PACKAGE_KIND_BADGE = {
  classes:
    'rounded-inline border border-border px-1.5 py-0.5 text-3xs leading-none font-medium tracking-wider text-foreground uppercase',
  source: `${RENDERER}/packages/packageCards.tsx`,
} satisfies CopiedClasses;

export const SETTINGS_CARD = {
  classes:
    "overflow-hidden rounded-container border border-border bg-card [&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:inset-x-5 [&>*+*]:before:top-0 [&>*+*]:before:h-px [&>*+*]:before:bg-border [&>*+*]:before:content-['']",
  source: `${RENDERER}/settings/settingsControls.tsx`,
} satisfies CopiedClasses;

export const SETTINGS_ROW = {
  classes: 'flex items-center justify-between gap-6 px-5 min-h-12',
  source: `${RENDERER}/settings/settingsControls.tsx`,
} satisfies CopiedClasses;

export const APP_UI_GROUPS: Record<string, CopiedClasses> = {
  BUTTON_BASE,
  BUTTON_BRAND_FILLED,
  BUTTON_FILLED,
  BUTTON_OUTLINE,
  BUTTON_HERO_SIZE,
  TOOLBAR_BUTTON,
  TOOLBAR_BUTTON_ON,
  ACTION_BUTTON,
  KBD,
  TOOLTIP_CONTENT,
  MENU_CONTENT,
  MENU_ITEM,
  SLASH_MENU_SURFACE,
  SLASH_MENU_ITEM,
  DIALOG_SURFACE,
  OVERLAY_BG,
  TERMINAL_TABS,
  TERMINAL_TAB,
  TERMINAL_TAB_CLOSE,
  CHAT_CARD,
  SIDEBAR_MENU_BUTTON,
  SESSION_ROW,
  SESSION_COLLAPSE_TOGGLE,
  CHIP_TABS,
  CHIP_TAB,
  PACKAGES_TAB,
  TREE_ROW,
  TREE_ROW_IDLE,
  TREE_ROW_SELECTED,
  SEGMENTED,
  SEGMENTED_ITEM,
  SEGMENTED_ITEM_ON,
  SEGMENTED_ITEM_OFF,
  QUOTE_CARD,
  QUOTE_SELECTION_BUTTON,
  PACKAGE_CARD,
  PACKAGE_KIND_BADGE,
  SETTINGS_CARD,
  SETTINGS_ROW,
};
