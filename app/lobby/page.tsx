'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import { createGameSocket } from '@/lib/socket';
import { useSessionStore } from '@/store/session';
import { useHydrateSession } from '@/lib/useHydrateSession';

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
  const socketRef = useRef<Socket | null>(null);

  // Redirect to /join once we know (post-hydration) there's no session.
  useEffect(() => {
    if (hasHydrated && !session) {
      router.replace('/join');
    }
  }, [hasHydrated, session, router]);

  // Open the socket once we have a session token.
  useEffect(() => {
    if (!session?.sessionToken) return;

    const socket = createGameSocket(session.sessionToken);
    socketRef.current = socket;

    socket.on('lobby:update', (snapshot: LobbySnapshot) => {
      setLobby(snapshot);
    });

    socket.on('game:error', (payload: { message?: string }) => {
      setSocketError(payload?.message ?? 'Error de sesión');
      clearSession();
      router.replace('/join');
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
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
        <span className="badge-coins">{session.coins} coins</span>
      </div>

      <h1>Lobby</h1>

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

      <a className="race-link" href="/race">
        Ir a la carrera →
      </a>
    </main>
  );
}
