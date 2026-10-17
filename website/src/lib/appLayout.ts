/**
 * Window and panel geometry.
 *
 * The panel numbers are the app's own — `src/renderer/src/lib/layoutConstants.ts`
 * is imported rather than copied, because it has no imports of its own and so
 * compiles here as-is. The sidebar's width, the terminal's height and the
 * transcript column on this page cannot drift from the app's: change one of them
 * there and this page is built with the new number.
 *
 * The window size is the one thing repeated by hand: it lives in the main process
 * (`src/main/windows/createMainWindow.ts`) next to Electron, which a static page
 * cannot import.
 */

export {
  CHAT_INPUT_MAX_WIDTH,
  MESSAGE_LIST_BOTTOM_INSET,
  MESSAGE_LIST_HORIZONTAL_PADDING,
  MESSAGE_LIST_MAX_WIDTH,
  MESSAGE_LIST_TOP_INSET,
  SIDEBAR_DEFAULT_WIDTH,
  TERMINAL_DEFAULT_HEIGHT,
} from '../../../src/renderer/src/lib/layoutConstants';

import { MESSAGE_LIST_BOTTOM_INSET } from '../../../src/renderer/src/lib/layoutConstants';

/**
 * The air below the last message of a scrolled session, which the app builds out
 * of two of the same number: the virtualizer's `paddingEnd` and the last row's
 * `marginBottom`, both `MESSAGE_LIST_BOTTOM_INSET` (see MessageList.tsx). The top
 * needs no such sum — it is `MESSAGE_LIST_TOP_INSET`, one inset and nothing else.
 */
export const MESSAGE_LIST_END_INSET_PX = MESSAGE_LIST_BOTTOM_INSET * 2;

/**
 * The window, from `createMainWindow.ts`: 1200x800 by default, and never narrower
 * than 680 — the app has no layout below that, because below that the sidebar and
 * a chat column stop both being usable.
 *
 * `WINDOW_MIN_WIDTH_PX` is what the page scales to when the viewport is narrower
 * than the app can go. A 390px phone gets the app at its minimum size, complete,
 * rather than a made-up phone layout of it: see `AppWindow.astro`.
 */
export const WINDOW_WIDTH_PX = 1200;
export const WINDOW_HEIGHT_PX = 800;
export const WINDOW_MIN_WIDTH_PX = 680;
