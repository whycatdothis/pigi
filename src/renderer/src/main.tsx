import './assets/main.css';
import './assets/searchHighlights.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Toaster } from './components/ui/sonner';
import { installDesignTokenSheet } from './dev/designTokenSheet';
import { installDebugHandle } from './lib/debugHandle';
import { installErrorReporting } from './lib/errorReporting';
import { installFocusModality } from './lib/focusModality';
import { installSelectionDismissal } from './lib/selectionDismissal';
import { initializePigiSettings } from './state/settingsStore';

installErrorReporting();

if (import.meta.env.DEV) {
  installDebugHandle();
  installDesignTokenSheet();
}

// Appearance is applied before the first paint, synchronously, so there is no
// colour flash. The update window is a separate entry (updateProgress.tsx).
initializePigiSettings();
installFocusModality();
installSelectionDismissal();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster />
  </StrictMode>,
);
