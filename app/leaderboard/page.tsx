'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_URL } from '@/lib/config';
import { getGameSocket } from '@/lib/socket';
import { useSessionStore } from '@/store/session';
import { useHydrateSession } from '@/lib/useHydrateSession';
import { Badge } from '@/components/ui/Badge';

const RANK_MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  coins: number;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const hasHydrated = useHydrateSession();
  const session = useSessionStore((state) => state.session);

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hasHydrated && !session) {
      router.replace('/join');
    }
  }, [hasHydrated, session, router]);

  // Initial snapshot via REST.
  useEffect(() => {
    let cancelled = false;

    fetch(`${API_URL}/leaderboard`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: LeaderboardEntry[]) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Live updates via the shared socket — broadcast after every race settles.
  useEffect(() => {
    if (!session?.sessionToken) return;

    const socket = getGameSocket(session.sessionToken);

    function handleLeaderboardUpdated(payload: { leaderboard: LeaderboardEntry[] }) {
      setEntries(payload.leaderboard);
    }

    socket.on('leaderboard:updated', handleLeaderboardUpdated);
    return () => {
      socket.off('leaderboard:updated', handleLeaderboardUpdated);
    };
  }, [session?.sessionToken]);

  if (!hasHydrated || !session) {
    return (
      <main className="loading-page">
        <p>Cargando...</p>
      </main>
    );
  }

  return (
    <main className="leaderboard-page">
      <div className="player-badge">
        <span className="badge-username">{session.username}</span>
        <Badge>{session.coins} coins</Badge>
      </div>

      <h1>🏆 Tabla de posiciones</h1>

      {loading ? (
        <p className="race-status">Cargando...</p>
      ) : (
        <ol className="leaderboard-list">
          {entries.map((entry) => (
            <li
              key={entry.playerId}
              className={`leaderboard-row${
                entry.playerId === session.playerId ? ' leaderboard-row--me' : ''
              }`}
            >
              <span className="leaderboard-rank">
                {RANK_MEDAL[entry.rank] ?? `#${entry.rank}`}
              </span>
              <span className="leaderboard-username">{entry.username}</span>
              <Badge className="leaderboard-coins">{entry.coins} coins</Badge>
            </li>
          ))}
        </ol>
      )}

      <Link className="race-link" href="/lobby">
        ← Volver al lobby
      </Link>
    </main>
  );
}
