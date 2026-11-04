import { useEffect, useRef } from 'react';
import { useAppStore } from '../state/appStore';

/**
 * Suppresses the next typewriter animation when a manual rename is detected
 * for the given session path, so explicit user renames do not animate.
 */
export function useRenameSuppress(sessionPath: string, skipNextAnimation: () => void): void {
  const isRenamed = useAppStore((state) => state.renamedSessionPaths.has(sessionPath));
  const prevIsRenamed = useRef(isRenamed);

  useEffect(() => {
    if (isRenamed && !prevIsRenamed.current) {
      skipNextAnimation();
      useAppStore.getState().clearSessionRenamed(sessionPath);
    }
    prevIsRenamed.current = isRenamed;
  }, [isRenamed, skipNextAnimation, sessionPath]);
}
