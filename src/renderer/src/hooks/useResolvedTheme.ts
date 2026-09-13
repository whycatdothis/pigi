import { useSyncExternalStore } from 'react';

export type ResolvedTheme = 'light' | 'dark';

/**
 * The theme the app is actually drawn in.
 *
 * `ThemeProvider` puts `light` or `dark` on the document element and keeps it
 * there for system changes too, so the class is the single source of truth: any
 * other way of asking would re-derive what that provider already decided.
 */
function readTheme(): ResolvedTheme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ['class'], attributes: true });
  return () => {
    observer.disconnect();
  };
}

export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, readTheme, () => 'light');
}
