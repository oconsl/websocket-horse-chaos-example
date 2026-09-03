'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getGameSocket } from '@/lib/socket';
import { useSessionStore } from '@/store/session';
import { useHydrateSession } from '@/lib/useHydrateSession';
import { Badge } from '@/components/ui/Badge';
import { TabloidNews } from '@/components/news/TabloidNews';

interface LobbyPlayer {
  playerId: string;
  username: string;
  coins: number;
}

interface LobbySnapshot {
  players: LobbyPlayer[];
  count: number;
}

export default function LobbyPage() {
  const router = useRouter();
  const hasHydrated = useHydrateSession();
  const session = useSessionStore((state) => state.session);
  const clearSession = useSessionStore((state) => state.clearSession);

  const [lobby, setLobby] = useState<LobbySnapshot | null>(null);
  const [socketError, setSocketError] = useState<string | null>(null);

  // Redirect to /join once we know (post-hydration) there's no session.
  useEffect(() => {
    if (hasHydrated && !session) {
      router.replace('/join');
    }
  }, [hasHydrated, session, router]);

  // Reuse the shared socket and just add/remove this page's own listeners —
  // never open/close a connection here (see lib/socket.ts).
  useEffect(() => {
    if (!session?.sessionToken) return;

    const socket = getGameSocket(session.sessionToken);

    function handleLobbyUpdate(snapshot: LobbySnapshot) {
      setLobby(snapshot);
    }

    function handleGameError(payload: { message?: string }) {
      setSocketError(payload?.message ?? 'Error de sesión');
      clearSession();
      router.replace('/join');
    }

    socket.on('lobby:update', handleLobbyUpdate);
    socket.on('game:error', handleGameError);

    return () => {
      socket.off('lobby:update', handleLobbyUpdate);
      socket.off('game:error', handleGameError);
    };
  }, [session?.sessionToken, clearSession, router]);

  if (!hasHydrated || !session) {
    return (
      <main className="lobby-page">
        <p>Cargando...</p>
      </main>
    );
  }

  return (
    <main className="lobby-page">
      <div className="player-badge">
        <span className="badge-username">{session.username}</span>
        <Badge>{session.coins} coins</Badge>
      </div>

      <h1>Lobby</h1>

      <TabloidNews />

      {socketError && <p className="error">{socketError}</p>}

      <p className="player-count">
        Jugadores conectados: {lobby?.count ?? 0}
      </p>

      <ul className="player-list">
        {lobby?.players.map((player) => (
          <li key={player.playerId}>
            <span>{player.username}</span>
            <span>{player.coins} coins</span>
          </li>
        ))}
      </ul>

      <div className="lobby-nav">
        {/*
          Client-side navigation via next/link, not a plain <a> — a full
          page reload would tear down the shared socket module and defeat
          the single-socket fix (the whole point is to KEEP the connection
          alive across /lobby <-> /race navigation).
        */}
        <Link className="race-link" href="/race">
          Ir a la carrera →
        </Link>
        <Link className="race-link" href="/leaderboard">
          🏆 Tabla de posiciones
        </Link>
      </div>
    </main>
  );
}
