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

/** The default window: 1200x800, minus the frame macOS adds. */
export const WINDOW_WIDTH_PX = 1200;
export const WINDOW_HEIGHT_PX = 800;
