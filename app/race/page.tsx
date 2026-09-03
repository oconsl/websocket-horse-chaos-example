'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import { API_URL } from '@/lib/config';
import { createGameSocket } from '@/lib/socket';
import { useSessionStore } from '@/store/session';
import { useHydrateSession } from '@/lib/useHydrateSession';

type RaceStatus = 'WAITING' | 'BETTING' | 'BETTING_CLOSED' | 'COUNTDOWN' | 'RACING' | 'RESULTS';

interface HorseOdds {
  horseId: string;
  name: string;
  lane: number;
  pool: number;
  odds: number | null;
}

interface OddsSnapshot {
  totalPool: number;
  horses: HorseOdds[];
}

interface RaceSnapshot {
  id: string;
  status: RaceStatus;
  odds: OddsSnapshot;
}

interface ConfirmedBet {
  horseId: string;
  amount: number;
}

const BET_STEP = 50;

export default function RacePage() {
  const router = useRouter();
  const hasHydrated = useHydrateSession();
  const session = useSessionStore((state) => state.session);
  const setCoins = useSessionStore((state) => state.setCoins);

  const [race, setRace] = useState<RaceSnapshot | null>(null);
  const [loadingRace, setLoadingRace] = useState(true);
  const [selectedHorseId, setSelectedHorseId] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState(BET_STEP);
  const [confirmedBet, setConfirmedBet] = useState<ConfirmedBet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (hasHydrated && !session) {
      router.replace('/join');
    }
  }, [hasHydrated, session, router]);

  // Initial snapshot via REST.
  useEffect(() => {
    let cancelled = false;

    async function loadCurrentRace() {
      try {
        const res = await fetch(`${API_URL}/races/current`);
        if (cancelled) return;
        if (res.status === 404) {
          setRace(null);
        } else if (res.ok) {
          setRace(await res.json());
        }
      } finally {
        if (!cancelled) setLoadingRace(false);
      }
    }

    loadCurrentRace();
    return () => {
      cancelled = true;
    };
  }, []);

  // Live odds/status via socket.
  useEffect(() => {
    if (!session?.sessionToken) return;

    const socket = createGameSocket(session.sessionToken);
    socketRef.current = socket;

    socket.on('betting:opened', (payload: { raceId: string; odds: OddsSnapshot }) => {
      setRace({ id: payload.raceId, status: 'BETTING', odds: payload.odds });
      setConfirmedBet(null);
      setSelectedHorseId(null);
    });

    socket.on('betting:closed', (payload: { raceId: string }) => {
      setRace((prev) =>
        prev && prev.id === payload.raceId ? { ...prev, status: 'BETTING_CLOSED' } : prev,
      );
    });

    socket.on('odds:updated', (payload: { raceId: string; odds: OddsSnapshot }) => {
      setRace((prev) => (prev && prev.id === payload.raceId ? { ...prev, odds: payload.odds } : prev));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session?.sessionToken]);

  const maxBet = useMemo(() => {
    const coins = session?.coins ?? 0;
    return Math.max(BET_STEP, Math.floor(coins / BET_STEP) * BET_STEP);
  }, [session?.coins]);

  function adjustBet(delta: number) {
    setBetAmount((current) => {
      const next = current + delta;
      const coins = session?.coins ?? 0;
      return Math.min(Math.max(next, BET_STEP), Math.max(coins, BET_STEP));
    });
  }

  async function placeBet() {
    if (!race || !selectedHorseId || !session) return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/races/${race.id}/bets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': session.sessionToken,
        },
        body: JSON.stringify({ horseId: selectedHorseId, amount: betAmount }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.message ?? 'No se pudo registrar la apuesta');
        return;
      }

      setConfirmedBet({ horseId: selectedHorseId, amount: betAmount });
      setCoins(session.coins - betAmount);
      if (data.odds) {
        setRace((prev) => (prev ? { ...prev, odds: data.odds } : prev));
      }
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setSubmitting(false);
    }
  }

  if (!hasHydrated || !session || loadingRace) {
    return (
      <main className="loading-page">
        <p>Cargando...</p>
      </main>
    );
  }

  return (
    <main className="race-page">
      <div className="player-badge">
        <span className="badge-username">{session.username}</span>
        <span className="badge-coins">{session.coins} coins</span>
      </div>

      <h1>Elegí tu caballo</h1>

      {!race && (
        <p className="race-status">Esperando a que el host cree una carrera...</p>
      )}

      {race && race.status === 'WAITING' && (
        <p className="race-status">Esperando a que se abran las apuestas...</p>
      )}

      {race && race.status === 'BETTING_CLOSED' && (
        <p className="race-status">Apuestas cerradas. ¡A correr!</p>
      )}

      {race && (race.status === 'BETTING' || race.status === 'BETTING_CLOSED') && (
        <>
          <ul className="horse-list">
            {race.odds.horses.map((horse) => {
              const maxPool = Math.max(1, ...race.odds.horses.map((h) => h.pool));
              const barPct = (horse.pool / maxPool) * 100;
              const isSelected = selectedHorseId === horse.horseId;
              const isMyBet = confirmedBet?.horseId === horse.horseId;

              return (
                <li
                  key={horse.horseId}
                  className={`horse-row${isSelected ? ' horse-row--selected' : ''}${
                    isMyBet ? ' horse-row--mine' : ''
                  }`}
                  onClick={() => {
                    if (race.status === 'BETTING' && !confirmedBet) {
                      setSelectedHorseId(horse.horseId);
                    }
                  }}
                >
                  <div className="horse-row-header">
                    <span className="horse-name">
                      #{horse.lane} {horse.name}
                    </span>
                    <span className="horse-odds">
                      {horse.odds !== null ? `x${horse.odds.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  <div className="horse-pool-bar">
                    <div className="horse-pool-fill" style={{ width: `${barPct}%` }} />
                  </div>
                  <span className="horse-pool-amount">{horse.pool} coins apostados</span>
                </li>
              );
            })}
          </ul>

          {race.status === 'BETTING' && !confirmedBet && (
            <div className="bet-panel">
              <div className="bet-stepper">
                <button type="button" onClick={() => adjustBet(-BET_STEP)} disabled={betAmount <= BET_STEP}>
                  −
                </button>
                <span className="bet-amount">{betAmount} coins</span>
                <button type="button" onClick={() => adjustBet(BET_STEP)} disabled={betAmount >= maxBet}>
                  +
                </button>
              </div>
              <button
                type="button"
                className="bet-submit"
                disabled={!selectedHorseId || submitting || betAmount > session.coins}
                onClick={placeBet}
              >
                {submitting ? 'APOSTANDO...' : 'APOSTAR'}
              </button>
              {error && <p className="error">{error}</p>}
            </div>
          )}

          {confirmedBet && (
            <p className="bet-confirmation">
              ✅ Apostaste {confirmedBet.amount} coins a{' '}
              {race.odds.horses.find((h) => h.horseId === confirmedBet.horseId)?.name}
            </p>
          )}
        </>
      )}
    </main>
  );
}
