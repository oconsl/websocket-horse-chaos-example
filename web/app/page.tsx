'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/store/session';
import { useHydrateSession } from '@/lib/useHydrateSession';

export default function Home() {
  const router = useRouter();
  const hasHydrated = useHydrateSession();
  const session = useSessionStore((state) => state.session);

  useEffect(() => {
    if (!hasHydrated) return;
    router.replace(session ? '/lobby' : '/join');
  }, [hasHydrated, session, router]);

  return (
    <main className="loading-page">
      <p>Cargando...</p>
    </main>
  );
}
