import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Session {
  playerId: string;
  username: string;
  coins: number;
  sessionToken: string;
}

interface SessionState {
  session: Session | null;
  hasHydrated: boolean;
  setSession: (session: Session) => void;
  setCoins: (coins: number) => void;
  clearSession: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      session: null,
      hasHydrated: false,
      setSession: (session) => set({ session }),
      setCoins: (coins) =>
        set((state) =>
          state.session ? { session: { ...state.session, coins } } : state,
        ),
      clearSession: () => set({ session: null }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'horse-chaos-session',
      storage: createJSONStorage(() => localStorage),
      // Avoid SSR/client hydration mismatches: we rehydrate manually on mount.
      skipHydration: true,
      partialize: (state) => ({ session: state.session }),
    },
  ),
);
