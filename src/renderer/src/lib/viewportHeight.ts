import { useSyncExternalStore } from 'react';

/**
 * Window height for styles that scale with it. Minimal mode mounts one clamped
 * user bubble per message, so the resize listener lives here instead of once
 * per bubble.
 */
const listeners = new Set<() => void>();

function handleResize(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  const isFirst = listeners.size === 0;
  listeners.add(listener);
  if (isFirst) window.addEventListener('resize', handleResize);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('resize', handleResize);
  };
}

function getSnapshot(): number {
  return window.innerHeight;
}

export function useViewportHeight(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}
