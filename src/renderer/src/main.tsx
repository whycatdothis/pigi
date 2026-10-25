import './assets/main.css';
import './assets/searchHighlights.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import UpdateProgress from './components/update/UpdateProgress';
import { Toaster } from './components/ui/sonner';
import { installDesignTokenSheet } from './dev/designTokenSheet';
import { installDebugHandle } from './lib/debugHandle';
import { installFocusModality } from './lib/focusModality';
import { UPDATE_PROGRESS_HASH } from '../../shared/routes';
import { initializePigiSettings } from './state/settingsStore';

if (import.meta.env.DEV) {
  installDebugHandle();
  installDesignTokenSheet();
}

// Apply the persisted theme and accent before first paint. Synchronous, so
// there is no color flash.
initializePigiSettings();
installFocusModality();

// Secondary windows load this same bundle and pick their UI from the hash; the
// main window loads with none. See shared/routes.ts.
const isUpdateProgressWindow = window.location.hash === UPDATE_PROGRESS_HASH;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isUpdateProgressWindow ? <UpdateProgress /> : <App />}
    <Toaster />
  </StrictMode>,
);
