export {
  CHAT_INPUT_MAX_WIDTH,
  MESSAGE_LIST_BOTTOM_INSET,
  MESSAGE_LIST_HORIZONTAL_PADDING,
  MESSAGE_LIST_MAX_WIDTH,
  MESSAGE_LIST_TOP_INSET,
  PACKAGES_CONTENT_MAX_WIDTH,
  RIGHT_SIDEBAR_DEFAULT_WIDTH,
  SETTINGS_CONTENT_MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  TERMINAL_DEFAULT_HEIGHT,
} from '../../../src/renderer/src/lib/layoutConstants';

import { MESSAGE_LIST_BOTTOM_INSET } from '../../../src/renderer/src/lib/layoutConstants';

// MessageList.tsx adds the virtualizer's paddingEnd and the last row's
// marginBottom, both MESSAGE_LIST_BOTTOM_INSET.
export const MESSAGE_LIST_END_INSET_PX = MESSAGE_LIST_BOTTOM_INSET * 2;

// Copied by hand from src/main/windows/createMainWindow.ts, which imports Electron.
export const WINDOW_WIDTH_PX = 1200;
export const WINDOW_HEIGHT_PX = 800;
export const WINDOW_MIN_WIDTH_PX = 680;
