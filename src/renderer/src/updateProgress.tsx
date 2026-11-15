/**
 * Entry for the update progress window (`updateProgress.html`).
 *
 * A second renderer entry rather than the main window's bundle picked by a hash:
 * a 400px status dialog has no business parsing the chat app, its terminal and
 * its diagram renderer before it can paint. It shares this package's modules
 * through the bundler's common chunk, so nothing is duplicated on disk.
 */
import './assets/main.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import UpdateProgress from './components/update/UpdateProgress';
import { Toaster } from './components/ui/sonner';
import { installErrorReporting } from './lib/errorReporting';
import { installFocusModality } from './lib/focusModality';
import { installSelectionDismissal } from './lib/selectionDismissal';
import { DEFAULT_APPEARANCE } from '../../shared/appearance';
import { applyAppearance } from './appearance/applyAppearance';
import { useSettingsStore } from './state/settingsStore';

installErrorReporting();

// The window is a system dialog: it keeps the user's light/dark mode, fonts and
// motion, but not their palette, so it is neutral white or dark like the OS's
// own update prompts instead of carrying the app's background colour.
function applyUpdateWindowAppearance(): void {
  const appearance = useSettingsStore.getState().appearance;
  applyAppearance({
    ...appearance,
    light: { ...DEFAULT_APPEARANCE.light, fonts: appearance.light.fonts },
    dark: { ...DEFAULT_APPEARANCE.dark, fonts: appearance.dark.fonts },
  });
}

applyUpdateWindowAppearance();
// A fresh window reports its appearance a moment after the first apply; the
// main window's initializer takes the same second chance.
requestAnimationFrame(applyUpdateWindowAppearance);
installFocusModality();
installSelectionDismissal();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UpdateProgress />
    <Toaster />
  </StrictMode>,
);
