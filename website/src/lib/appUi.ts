/**
 * The app's own shadcn strings, copied instead of reinvented.
 *
 * The app's `components/ui/*.tsx` files are shadcn components (style
 * `radix-nova`, see `components.json`), and almost all of what they are is a
 * string of Tailwind classes. Those strings are the app's interface: the radius
 * of a button, the ring on a menu, the padding inside a dialog. Writing our own
 * lookalikes here would make the page a drawing of the app rather than the same
 * design in another renderer, so each group below is copied verbatim, with the
 * file it came from.
 *
 * Where the app composes a component's string out of a base plus a call site's
 * override (`SessionToolbar`'s view-mode items), the copy is the composition,
 * not just the base.
 *
 * **What is not copied, and why.** The strings carry Radix's state selectors —
 * `data-[state=checked]`, `focus:`, `data-open:`. In this markup those states are
 * written by hand (a still has one chosen item and no focus), and the ones that
 * cannot fire at all are left in the string so the copy stays a copy. Anything
 * the app expresses through a Radix attribute the page does not have — a hover
 * card, a portal, a focus trap — is simply absent.
 *
 * `scripts/checkAppClassDrift.mjs` walks this file and asserts that every class
 * here still exists in the app file it names, so a change in the app turns into
 * a failing check instead of a page that quietly stops matching it.
 */

/** Where each group was copied from, for the drift check and for the reader. */
const UI = 'src/renderer/src/components/ui';
const RENDERER = 'src/renderer/src/components';

interface CopiedClasses {
  classes: string;
  /** File the strings came from, relative to the repository root. */
  source: string;
  /** Files a composition also drew from, when the app composes at a call site. */
  alsoFrom?: string[];
  /**
   * Classes that are deliberately this page's, not the app's: the checker skips
   * them. Each one is explained where the group is declared.
   */
  siteClasses?: string[];
}

/**
 * The session toolbar's icon buttons.
 *
 * These are not `ui/button.tsx` at all: SessionToolbar draws plain `<button>`s
 * with their own string, three times over with only the text colour changing.
 * The copy is that shared string; `[-webkit-app-region:no-drag]`, which is the
 * window's drag region and means nothing on a page, is left out.
 */
export const TOOLBAR_BUTTON = {
  classes:
    'flex items-center justify-center rounded p-1 transition-colors size-7 hover:bg-muted text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
  source: `${RENDERER}/session/SessionToolbar.tsx`,
} satisfies CopiedClasses;

/** The same button while its panel is open: the label goes to full contrast. */
export const TOOLBAR_BUTTON_ON = {
  classes: 'text-foreground',
  source: `${RENDERER}/session/SessionToolbar.tsx`,
} satisfies CopiedClasses;

/**
 * The app's `ui/kbd.tsx` key cap, without its size: a tooltip's is
 * `h-5 min-w-5 text-caption`, a tab's or the Quote button's `h-4 min-w-4` with
 * a smaller type. The app overrides the size through `cn()`; with no
 * tailwind-merge here, two heights in one class list would leave the
 * stylesheet's order to pick, so each call site adds the one it wants.
 * Give the element `data-slot="kbd"` so the tooltip's kbd padding applies.
 */
export const KBD = {
  classes:
    'pointer-events-none inline-flex w-fit items-center justify-center gap-1 rounded-inline border border-foreground/10 bg-muted px-1 font-sans font-normal text-muted-foreground select-none',
  source: `${UI}/kbd.tsx`,
} satisfies CopiedClasses;

/**
 * The primary button: the app's `variant="default" size="default"`.
 *
 * The page's two download buttons are drawn at their own scale — the app has no
 * hero-sized button to copy — but everything that makes a button a button (the
 * radius, the weight, the focus ring, the icon sizing) is the app's.
 *
 * The base's `text-body` is left to its call site: the app's `text-body` is 15px on
 * its own scale, which is right in a window and too big in the site's header,
 * where the row is 13px. Both sizes are named below rather than left to whichever
 * of two font-size utilities the stylesheet happens to order last.
 */
export const BUTTON_BASE = {
  classes:
    "group/button inline-flex shrink-0 items-center justify-center rounded-control border bg-clip-padding font-normal whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  source: `${UI}/button.tsx`,
} satisfies CopiedClasses;

/**
 * `variant="default"`, the one filled button in the app. `--primary` is the
 * accent's fill once the app's tokens are written (`src/lib/appTheme.ts`), so
 * this follows whatever accent the page is in.
 */
export const BUTTON_FILLED = {
  classes: 'border-transparent bg-primary text-primary-foreground hover:bg-primary-hover',
  source: `${UI}/button.tsx`,
} satisfies CopiedClasses;

/**
 * `variant="outline"`. The base's border colour (`border-transparent`) lives in
 * the variants here rather than in `BUTTON_BASE`, which is where `cn()` would
 * have dropped it.
 */
export const BUTTON_OUTLINE = {
  classes:
    'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
  source: `${UI}/button.tsx`,
} satisfies CopiedClasses;

/**
 * The page's download button: the app's filled variant's mechanics, filled with
 * the pig's pink instead of the app's primary.
 *
 * Every button on this page that belongs to the app wears `BUTTON_FILLED`
 * unchanged, in the accent the reader can change in the Appearance still. This
 * one is the page's own call to action, so it wears the page's fixed colour:
 * `--brand`, pink, with white printed on it. The icon's own pink (`#f6729b`) is
 * 2.7:1 against white and cannot carry it, so the fill is that hue
 * deepened to where white reads (4.8:1) — the same pink the rest of the page uses
 * at text lightness. The fill does not flip with the theme, so neither does the
 * ink: the button is one pink in both.
 */
export const BUTTON_BRAND_FILLED = {
  classes:
    'border-transparent bg-[var(--brand)] text-[var(--brand-ink)] [a]:hover:bg-[var(--brand)]/85',
  source: `${UI}/button.tsx`,
  siteClasses: ['bg-[var(--brand)]', 'text-[var(--brand-ink)]', '[a]:hover:bg-[var(--brand)]/85'],
} satisfies CopiedClasses;

/**
 * The hero's download button: the app's filled variant at the page's own scale.
 *
 * There is nothing in the app this tall, so the size is this page's — and it is
 * named here rather than left as a one-off so the two places that draw the big
 * button cannot disagree about it.
 */
export const BUTTON_HERO_SIZE = {
  classes: 'h-12 gap-2.5 px-5 text-body',
  source: `${UI}/button.tsx`,
  siteClasses: ['h-12', 'gap-2.5', 'px-5'],
} satisfies CopiedClasses;

/**
 * A tooltip: the app's `surface` variant, which is its default.
 *
 * The app's tooltips are Radix portals with a 400ms delay; here they are a child
 * of the button that shows itself on hover (`.app-tooltip` owns the position and
 * the delay). The surface itself is the app's, down to the hairline ring — which
 * is what makes a tooltip look like the popover family it belongs to.
 */
export const TOOLTIP_CONTENT = {
  classes:
    'z-50 inline-flex w-fit max-w-xs items-center gap-1.5 text-caption has-data-[slot=kbd]:pr-1.5 rounded-control-sm bg-popover px-2.5 py-1.5 text-popover-foreground shadow-md ring-[0.5px] ring-foreground/25',
  source: `${UI}/tooltip.tsx`,
} satisfies CopiedClasses;

/**
 * A dropdown menu, as the view-mode menu uses one.
 *
 * The base is `DropdownMenuContent`; the app's SessionToolbar then overrides it
 * with `.menu-content` (radius and padding in `assets/main.css`) plus
 * `w-fit min-w-0 bg-popover/50 backdrop-blur-md` — a menu you can see the window
 * through. That is the string this is.
 *
 * The base's own `bg-popover` and `p-1` are left out: they are the two the call
 * site replaces, and Tailwind would have to break that tie by stylesheet order,
 * which is not something a copy should rely on. The padding is the same
 * quarter-rem either way.
 */
export const MENU_CONTENT = {
  classes:
    'z-50 overflow-x-hidden overflow-y-auto text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 rounded-surface w-fit min-w-0 bg-popover/50 backdrop-blur-md',
  source: `${UI}/dropdown-menu.tsx`,
  alsoFrom: [`${RENDERER}/session/SessionToolbar.tsx`],
} satisfies CopiedClasses;

/**
 * A radio item in that menu, checked or not.
 *
 * The app's `DropdownMenuRadioItem` with `compact`, which swaps the base's size,
 * padding and focus colours for `COMPACT_SELECTION_ITEM_CLASS`
 * (`ui/selectionStyles.ts`): the caption row every short mode menu shares, with
 * the checked row tinted and labelled in the system accent. The toolbar puts the
 * check inline after the label. The `data-state=checked` this page writes into the
 * markup is the attribute Radix would have written.
 */
export const MENU_ITEM = {
  classes:
    "relative flex cursor-default items-center outline-hidden select-none data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 gap-1 rounded-control pl-2 pr-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-[state=checked]:bg-accent-subtle data-[state=checked]:text-[var(--system-accent)] data-[state=checked]:hover:bg-accent-subtle data-[state=checked]:hover:text-[var(--system-accent)] data-[state=checked]:focus:bg-accent-subtle data-[state=checked]:focus:text-[var(--system-accent)] data-[state=checked]:focus:**:text-[var(--system-accent)] py-1 text-caption",
  source: `${UI}/dropdown-menu.tsx`,
  alsoFrom: [`${UI}/selectionStyles.ts`],
} satisfies CopiedClasses;

/**
 * A dialog panel: the tree, and the session switcher's palette.
 *
 * The app's `VIBRANCY_OVERLAY_CONTENT` (`lib/layoutConstants.ts`) is
 * `bg-popover/88` plus a blur, because it floats over a window that is itself
 * translucent. A page has nothing behind it to blur into, so the background is
 * the opaque stand-in the app defines for exactly this case,
 * `--dialog-solid` — "a pinned surface inside a dialog cannot use the translucent
 * material". Everything else is untouched.
 *
 * The app's `p-4` and `gap-4` are the part of that string a dialog is expected to
 * replace: the session tree passes `p-0`, the switcher pads its own rows. This is
 * the surface those call sites paint on, so the padding belongs to them.
 *
 * The base's `p-4` is left out: both dialogs in the app override it with `p-0` and
 * pad their own rows, and both dialogs on this page do the same.
 */
/**
 * The slash-command popover: the app's translucent overlay surface
 * (`VIBRANCY_OVERLAY_CONTENT`) at the `bg-popover/50` and `p-1` the popover
 * asks for, the transcript blurred through it.
 */
export const SLASH_MENU_SURFACE = {
  classes:
    'rounded-surface bg-popover/50 backdrop-blur-sm p-1 text-body text-popover-foreground shadow-md outline-[0.5px] outline-foreground/25',
  source: 'src/renderer/src/lib/layoutConstants.ts',
  alsoFrom: [`${RENDERER}/chatInput/slashCommandPopover.tsx`],
} satisfies CopiedClasses;

/** A row of it; the selected one sits on the accent's subtle tint, its name in the accent. */
export const SLASH_MENU_ITEM = {
  classes: 'flex w-full items-center gap-2 rounded-control px-2 py-1 text-left text-ui',
  source: `${RENDERER}/chatInput/slashCommandPopover.tsx`,
} satisfies CopiedClasses;

export const DIALOG_SURFACE = {
  classes:
    'rounded-surface text-body text-popover-foreground shadow-md outline-[0.5px] outline-foreground/25 bg-[var(--dialog-solid)]',
  source: 'src/renderer/src/lib/layoutConstants.ts',
  siteClasses: ['bg-[var(--dialog-solid)]'],
} satisfies CopiedClasses;

/**
 * The terminal's tab strip, and one tab in it.
 *
 * TerminalPanel uses `ui/tabs.tsx` with `variant="chip"`: a list with no track,
 * where the active tab is a rounded muted pill. Three strings stack up — the
 * list's chip variant, the trigger's base, and TerminalPanel's own override — so
 * the composition is copied rather than the base, with the tokens an override
 * replaces left out (the base's `text-sm`, `px-1.5 py-0.5`, `rounded-md`,
 * `flex-1`), for the same reason the menu above does it.
 */
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

/** The tab's close button: hidden until the pointer is over the tab. */
export const TERMINAL_TAB_CLOSE = {
  classes:
    '-mr-1 ml-0.5 flex size-3.5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-foreground/10 group-hover/tab:opacity-100 group-data-[state=active]/tab:opacity-100',
  source: `${RENDERER}/terminal/TerminalPanel.tsx`,
} satisfies CopiedClasses;

/**
 * A floating panel that shows the window through it.
 *
 * `OVERLAY_BG` is the app's own constant (`lib/layoutConstants.ts`) for
 * "background colour used by transparent floating panels" — the minimap's hover
 * list, the session switcher's palette. It is exported for exactly this reason:
 * `UserMessageMiniMap.tsx` pairs it with `backdrop-blur-md`, `SessionSwitcher.tsx`
 * with nothing, and the constant keeps them one colour.
 */
export const OVERLAY_BG = {
  classes: 'bg-popover/40 backdrop-blur-md',
  source: 'src/renderer/src/lib/layoutConstants.ts',
  siteClasses: ['backdrop-blur-md'],
} satisfies CopiedClasses;

/**
 * A message's action icon: a bare ghost button that fills in on hover.
 *
 * A fork's half of `MessageToolbar` (`messageBubbles.tsx`, `ACTION_BUTTON_CLASS_NAME`).
 */
export const ACTION_BUTTON = {
  classes:
    'flex items-center justify-center rounded-inline p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
  source: `${RENDERER}/message/messageBubbles.tsx`,
} satisfies CopiedClasses;

/**
 * The chat input's card.
 *
 * The app's `InputGroup` in the composer, minus the `has-[[data-slot=…]]`
 * selectors that describe its real focus behaviour — what is left is the shape:
 * the composer's own radius, a hairline border, and its shadow. The radius is a
 * two-part composition in the app: the call site sets `--input-group-radius` to
 * the composer's tier and the input group rounds itself by that variable, so
 * both halves are copied.
 */
export const CHAT_CARD = {
  classes:
    'relative h-auto flex-col border bg-background dark:bg-background shadow-composer [--input-group-radius:var(--radius-surface-xl)] rounded-[var(--input-group-radius,var(--radius-control))]',
  source: `${RENDERER}/chatInput/index.tsx`,
  alsoFrom: [`${UI}/input-group.tsx`],
} satisfies CopiedClasses;

/**
 * A row of the sidebar's top menu (New chat, Open project, Packages, Settings)
 * and a project row: `sidebarMenuButtonVariants` at its default size. The
 * selected row is `data-active`, which is what puts the accent tint behind it.
 */
export const SIDEBAR_MENU_BUTTON = {
  classes:
    'flex w-full items-center gap-1.5 overflow-hidden rounded-control p-2 text-left text-body outline-hidden hover:bg-primary/5 hover:text-sidebar-accent-foreground data-active:bg-primary/10 data-active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate h-8',
  source: `${UI}/sidebar.tsx`,
} satisfies CopiedClasses;

/**
 * A session row: `SidebarMenuSubButton` at `md`, with the session list's own
 * indent and colour (`SESSION_ROW_CLASS_NAME`).
 */
export const SESSION_ROW = {
  classes:
    'flex h-7 min-w-0 items-center gap-1.5 overflow-hidden rounded-control px-2 outline-hidden hover:bg-primary/5 hover:text-sidebar-accent-foreground data-active:bg-primary/10 data-active:text-sidebar-accent-foreground w-full justify-start pl-6 text-left text-sidebar-foreground/85',
  source: `${UI}/sidebar.tsx`,
  alsoFrom: [`${RENDERER}/sidebar/sessionList.tsx`],
} satisfies CopiedClasses;

/** The chevron in a session row's gutter that folds its forks and subagents. */
export const SESSION_COLLAPSE_TOGGLE = {
  classes:
    'absolute left-1 top-1/2 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded-control text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
  source: `${RENDERER}/sidebar/sessionList.tsx`,
} satisfies CopiedClasses;

/**
 * The header's Chat / Files / Git tabs and the right sidebar's Quotes tab:
 * `ui/tabs.tsx` in its `chip` variant, where the active tab is a muted pill.
 * The list carries `data-variant="chip"` for the trigger's group selectors.
 */
export const CHIP_TABS = {
  classes:
    'group/tabs-list inline-flex w-fit items-center justify-center rounded-control text-muted-foreground gap-1 bg-transparent p-0',
  source: `${UI}/tabs.tsx`,
} satisfies CopiedClasses;

/**
 * A header tab — `ui/tabs.tsx`'s trigger as `WorkspaceTabs.tsx` merges it, with
 * the conflicting base classes already dropped.
 */
export const CHIP_TAB = {
  classes:
    "relative inline-flex items-center rounded-control-sm border border-transparent py-0.5 whitespace-nowrap transition-all hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 group-data-[variant=chip]/tabs-list:data-[state=active]:bg-muted dark:group-data-[variant=chip]/tabs-list:data-[state=active]:bg-muted h-8 gap-1.5 px-3 font-normal text-foreground",
  source: `${UI}/tabs.tsx`,
  alsoFrom: [`${RENDERER}/app/WorkspaceTabs.tsx`],
} satisfies CopiedClasses;

/**
 * The Packages page's Installed / Marketplace tabs: the same trigger left at its
 * own medium weight and dimmed idle colour, with the page's `px-3`.
 */
export const PACKAGES_TAB = {
  classes:
    'relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-control-sm border border-transparent px-3 py-0.5 text-body font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=chip]/tabs-list:data-[state=active]:bg-muted dark:group-data-[variant=chip]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=chip]/tabs-list:data-[state=active]:bg-muted data-[state=active]:text-foreground dark:data-[state=active]:text-foreground',
  source: `${UI}/tabs.tsx`,
  alsoFrom: [`${RENDERER}/packages/PackagesPage.tsx`],
} satisfies CopiedClasses;

/**
 * A row of the Files tree and of the Git tab's file list. The two sidebars
 * share the string, idle and selected.
 */
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

/** Preview / Source in the file viewer, Unified / Split in the diff viewer. */
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

/** One quote in the right sidebar's panel. */
export const QUOTE_CARD = {
  classes:
    'group relative flex flex-col gap-2 rounded-surface-sm bg-muted/50 p-2.5 ring-[0.5px] ring-foreground/10',
  source: `${RENDERER}/quotes/QuotePanel.tsx`,
} satisfies CopiedClasses;

/** The button that appears over a selection, before it becomes the comment editor. */
export const QUOTE_SELECTION_BUTTON = {
  classes:
    'absolute z-20 flex h-7 items-center gap-1.5 rounded-control bg-popover/88 px-2.5 text-caption font-medium text-popover-foreground shadow-md ring-[0.5px] ring-foreground/25 backdrop-blur-sm transition-colors hover:bg-muted/88',
  source: `${RENDERER}/quotes/QuoteSelectionPopover.tsx`,
} satisfies CopiedClasses;

/** A card on the Packages page, installed or from the marketplace. */
export const PACKAGE_CARD = {
  classes:
    'relative flex min-w-0 gap-3.5 rounded-surface-lg border border-border bg-card p-4 transition-colors hover:bg-muted/40',
  source: `${RENDERER}/packages/packageCards.tsx`,
} satisfies CopiedClasses;

/** The resource kinds a package ships, as the small capitals under its card. */
export const PACKAGE_KIND_BADGE = {
  classes:
    'rounded-inline border border-border px-1.5 py-0.5 text-3xs leading-none font-medium tracking-wider text-foreground uppercase',
  source: `${RENDERER}/packages/packageCards.tsx`,
} satisfies CopiedClasses;

/** A settings card: rows separated by inset hairlines, the page's largest radius. */
export const SETTINGS_CARD = {
  classes:
    "overflow-hidden rounded-container border border-border bg-card [&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:inset-x-5 [&>*+*]:before:top-0 [&>*+*]:before:h-px [&>*+*]:before:bg-border [&>*+*]:before:content-['']",
  source: `${RENDERER}/settings/settingsControls.tsx`,
} satisfies CopiedClasses;

export const SETTINGS_ROW = {
  classes: 'flex items-center justify-between gap-6 px-5 min-h-12',
  source: `${RENDERER}/settings/settingsControls.tsx`,
} satisfies CopiedClasses;

/**
 * Every group, for `scripts/checkAppClassDrift.mjs`.
 *
 * The check imports this file directly (Node strips the types), so a group added
 * here is checked without a second list to keep in step.
 */
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
