/**
 * Renderer hash routes.
 *
 * The main window loads with no hash. Secondary windows load the same renderer
 * bundle and pick their UI from `window.location.hash` (see `renderer/main.tsx`),
 * which avoids a second vite entry and keeps one preload/renderer bundle.
 */

/** The standalone update progress window. */
export const UPDATE_PROGRESS_HASH = '#/update-progress';
