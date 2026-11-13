import './assets/main.css';
import './assets/searchHighlights.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import UpdateProgress from './components/update/UpdateProgress';
import { Toaster } from './components/ui/sonner';
import { installDesignTokenSheet } from './dev/designTokenSheet';
import { installDebugHandle } from './lib/debugHandle';
import { installErrorReporting } from './lib/errorReporting';
import { installFocusModality } from './lib/focusModality';
import { installSelectionDismissal } from './lib/selectionDismissal';
import { DEFAULT_APPEARANCE } from '../../shared/appearance';
import { UPDATE_PROGRESS_HASH } from '../../shared/routes';
import { applyAppearance } from './appearance/applyAppearance';
import { initializePigiSettings, useSettingsStore } from './state/settingsStore';

installErrorReporting();

if (import.meta.env.DEV) {
  installDebugHandle();
  installDesignTokenSheet();
}

// Secondary windows load this same bundle and pick their UI from the hash; the
// main window loads with none. See shared/routes.ts.
const isUpdateProgressWindow = window.location.hash === UPDATE_PROGRESS_HASH;

// Apply the theme before first paint, synchronously, so there is no colour
// flash. The progress window is a system dialog: it keeps the user's light/dark
// mode, fonts and motion, but not their palette, so it is neutral white or dark
// like the OS's own update prompts instead of carrying the app's background
// colour.
function applyUpdateWindowAppearance(): void {
  const appearance = useSettingsStore.getState().appearance;
  applyAppearance({
    ...appearance,
    light: { ...DEFAULT_APPEARANCE.light, fonts: appearance.light.fonts },
    dark: { ...DEFAULT_APPEARANCE.dark, fonts: appearance.dark.fonts },
  });
}

if (isUpdateProgressWindow) {
  applyUpdateWindowAppearance();
  // A fresh window reports its appearance a moment after the first apply; the
  // main window's initializer takes the same second chance.
  requestAnimationFrame(applyUpdateWindowAppearance);
} else {
  initializePigiSettings();
}
installFocusModality();
installSelectionDismissal();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isUpdateProgressWindow ? <UpdateProgress /> : <App />}
    <Toaster />
  </StrictMode>,
);
