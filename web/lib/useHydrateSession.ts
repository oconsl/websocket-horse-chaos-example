'use client';

import { useEffect } from 'react';
import { useSessionStore } from '@/store/session';

/**
 * Manually rehydrates the zustand-persisted session store on the client.
 * The store uses `skipHydration: true` to avoid SSR/client mismatches, so
 * every page that reads `session` must call this hook once on mount before
 * trusting `session` / `hasHydrated`.
 */
export function useHydrateSession() {
  const hasHydrated = useSessionStore((state) => state.hasHydrated);

  useEffect(() => {
    const unsub = useSessionStore.persist.onFinishHydration(() => {
      useSessionStore.getState().setHasHydrated(true);
    });
    useSessionStore.persist.rehydrate();
    return unsub;
  }, []);

  return hasHydrated;
}
