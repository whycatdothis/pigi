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
 * The shortcut inside that button's tooltip.
 *
 * A plain `<kbd>`, not `ui/kbd.tsx`: the app only boxes a key cap in a menu, and
 * in a tooltip it lets the text sit on the tooltip's own surface.
 */
export const TOOLTIP_KBD = {
  classes: 'font-mono text-xs text-muted-foreground',
  source: `${RENDERER}/session/SessionToolbar.tsx`,
} satisfies CopiedClasses;

/**
 * The primary button: the app's `variant="default" size="default"`.
 *
 * The page's two download buttons are drawn at their own scale — the app has no
 * hero-sized button to copy — but everything that makes a button a button (the
 * radius, the weight, the focus ring, the icon sizing) is the app's.
 *
 * The base's `text-sm` is left to its call site: the app's `text-sm` is 15px on
 * its own scale, which is right in a window and too big in the site's header,
 * where the row is 13px. Both sizes are named below rather than left to whichever
 * of two font-size utilities the stylesheet happens to order last.
 */
export const BUTTON_BASE = {
  classes:
    "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding font-normal whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  source: `${UI}/button.tsx`,
} satisfies CopiedClasses;

/** `variant="default"`, the one filled button in the app. */
export const BUTTON_FILLED = {
  classes: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
  source: `${UI}/button.tsx`,
} satisfies CopiedClasses;

/**
 * The page's download button: the app's filled variant's mechanics, filled with
 * the pig's pink instead of the app's primary.
 *
 * Inside a window the primary control is neutral, and it stays that way here —
 * every button on this page that belongs to the app wears `BUTTON_FILLED`
 * unchanged. This one is the page's own call to action, so it wears the page's
 * colour: `--brand`, pink, with white printed on it. The icon's own pink
 * (`#f6729b`) is 2.7:1 against white and cannot carry it, so the fill is that hue
 * deepened to where white reads (4.8:1) — the same pink the rest of the page uses
 * at text lightness. The fill does not flip with the theme, so neither does the
 * ink: the button is one pink in both.
 */
export const BUTTON_BRAND_FILLED = {
  classes: 'bg-[var(--brand)] text-[var(--brand-ink)] [a]:hover:bg-[var(--brand)]/85',
  source: `${UI}/button.tsx`,
  siteClasses: ['bg-[var(--brand)]', 'text-[var(--brand-ink)]', '[a]:hover:bg-[var(--brand)]/85'],
} satisfies CopiedClasses;

/**
 * The header button's type size: the page's, not the app's.
 *
 * Every label in the header is 13px (`text-[13px]` on the nav links). The app's
 * 15px `text-sm` made the one button in that row a size larger than the row it
 * sits in.
 */
export const BUTTON_TEXT_HEADER = {
  classes: 'text-[13px]',
  source: `${UI}/button.tsx`,
  siteClasses: ['text-[13px]'],
} satisfies CopiedClasses;

/** `size="default"` — 32px, what the header's download button wears. */
export const BUTTON_SIZE_DEFAULT = {
  classes: 'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
  source: `${UI}/button.tsx`,
} satisfies CopiedClasses;

/**
 * The hero's download button: the app's filled variant at the page's own scale.
 *
 * There is nothing in the app this tall, so the size is this page's — and it is
 * named here rather than left as a one-off so the two places that draw the big
 * button cannot disagree about it.
 */
export const BUTTON_HERO_SIZE = {
  classes: 'h-12 gap-2.5 px-5 text-sm',
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
    'z-50 inline-flex w-fit max-w-xs items-center gap-1.5 text-xs rounded-md bg-popover px-2.5 py-1.5 text-popover-foreground shadow-md ring-[0.5px] ring-foreground/25',
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
    'z-50 overflow-x-hidden overflow-y-auto text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 rounded-lg w-fit min-w-0 bg-popover/50 backdrop-blur-md',
  source: `${UI}/dropdown-menu.tsx`,
  alsoFrom: [`${RENDERER}/session/SessionToolbar.tsx`],
} satisfies CopiedClasses;

/**
 * A radio item in that menu, checked or not.
 *
 * The app's `DropdownMenuRadioItem` plus the SessionToolbar's own
 * `viewModeItemClassName`, which replaces the far-right checkmark indicator with
 * an inline one and paints the checked item with the system accent. The
 * `data-state=checked` this page writes into the markup is the attribute Radix
 * would have written. As in the menu content above, the padding and the gap the
 * call site names replace the base's, so the base's are left out rather than left
 * to stylesheet order.
 */
export const MENU_ITEM = {
  classes:
    "relative flex cursor-default items-center rounded-md text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 gap-1 pl-2 pr-2 py-1 text-xs transition-colors data-[state=checked]:bg-[var(--system-accent)]/10 data-[state=checked]:text-[var(--system-accent)] data-[state=checked]:focus:bg-[var(--system-accent)]/10 data-[state=checked]:focus:text-[var(--system-accent)]",
  source: `${UI}/dropdown-menu.tsx`,
  alsoFrom: [`${RENDERER}/session/SessionToolbar.tsx`],
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
export const DIALOG_SURFACE = {
  classes:
    'rounded-xl text-sm text-popover-foreground shadow-md ring-[0.5px] ring-foreground/25 outline-hidden bg-[var(--dialog-solid)]',
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
    'group/tabs-list inline-flex w-fit items-center justify-center rounded-lg gap-1 bg-transparent p-0 text-muted-foreground',
  source: `${UI}/tabs.tsx`,
} satisfies CopiedClasses;

export const TERMINAL_TAB = {
  classes:
    'group/tab relative inline-flex items-center justify-center gap-1.5 border border-transparent whitespace-nowrap text-foreground/60 transition-all hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=chip]/tabs-list:rounded-lg group-data-[variant=chip]/tabs-list:data-[state=active]:bg-muted group-data-[variant=chip]/tabs-list:data-[state=active]:shadow-none data-[state=active]:text-foreground h-8 max-w-40 flex-none px-2.5 text-xs font-normal text-muted-foreground',
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
    'flex items-center justify-center rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
  source: `${RENDERER}/message/messageBubbles.tsx`,
} satisfies CopiedClasses;

/**
 * The chat input's card.
 *
 * The app's `InputGroup` in the composer, minus the `has-[[data-slot=…]]`
 * selectors that describe its real focus behaviour — what is left is the shape:
 * a 3xl radius, a hairline border, and that shadow.
 */
export const CHAT_CARD = {
  classes:
    'relative h-auto flex-col rounded-3xl border bg-background shadow-[0_10px_34px_rgb(0_0_0_/_0.075)]',
  source: `${RENDERER}/chatInput/index.tsx`,
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
  BUTTON_SIZE_DEFAULT,
  BUTTON_HERO_SIZE,
  BUTTON_TEXT_HEADER,
  TOOLBAR_BUTTON,
  TOOLBAR_BUTTON_ON,
  ACTION_BUTTON,
  TOOLTIP_KBD,
  TOOLTIP_CONTENT,
  MENU_CONTENT,
  MENU_ITEM,
  DIALOG_SURFACE,
  OVERLAY_BG,
  TERMINAL_TABS,
  TERMINAL_TAB,
  TERMINAL_TAB_CLOSE,
  CHAT_CARD,
};
