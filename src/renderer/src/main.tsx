import './assets/main.css';
import './assets/searchHighlights.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import UpdateProgress from './components/update/UpdateProgress';
import { Toaster } from './components/ui/sonner';
import { applyThemeAccent, DEFAULT_THEME_ACCENT_ID } from './lib/themeAccents';
import { installDebugHandle } from './lib/debugHandle';
import { installFocusModality } from './lib/focusModality';
import { UPDATE_PROGRESS_HASH } from '../../shared/routes';

if (import.meta.env.DEV) {
  installDebugHandle();
}

// Publish the app accent before first paint. Synchronous, so no color flash.
// A future settings page will call applyThemeAccent with the user's choice.
applyThemeAccent(DEFAULT_THEME_ACCENT_ID);
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
