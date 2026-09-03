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

interface RaceHorseSnapshot {
  lane: number;
  position: number;
  speed: number;
}

interface RaceEventPayload {
  raceId: string;
  type: string;
  [key: string]: unknown;
}

interface HorseFinish {
  lane: number;
  horseId: string;
  place: number;
}

interface CoinsUpdatedPayload {
  coins: number;
  reason: 'race_payout' | 'bailout';
}

type PowerUpType = 'TURBO' | 'SLOW' | 'BOMB' | 'SHIELD';

interface PowerUp {
  id: string;
  type: PowerUpType;
}

interface PowerUpReceivedPayload {
  raceId: string;
  powerUps: PowerUp[];
}

interface GameErrorPayload {
  message: string;
}

const POWER_UP_INFO: Record<PowerUpType, { emoji: string; label: string }> = {
  TURBO: { emoji: '⚡', label: 'Turbo' },
  SLOW: { emoji: '🐌', label: 'Lentitud' },
  BOMB: { emoji: '💣', label: 'Bomba' },
  SHIELD: { emoji: '🛡️', label: 'Escudo' },
};

interface RaceResults {
  raceId: string;
  status: RaceStatus;
  standings: { lane: number; horseId: string; name: string; place: number }[];
  myBet: { horseId: string; amount: number; payout: number | null } | null;
}

/** Matches api/src/game/race-engine.service.ts TRACK_LENGTH. */
const TRACK_LENGTH = 1000;
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

  const [countdown, setCountdown] = useState<number | null>(null);
  const [horsePositions, setHorsePositions] = useState<RaceHorseSnapshot[]>([]);
  const [events, setEvents] = useState<RaceEventPayload[]>([]);
  const [standings, setStandings] = useState<HorseFinish[] | null>(null);
  const [payout, setPayout] = useState<CoinsUpdatedPayload | null>(null);
  const [results, setResults] = useState<RaceResults | null>(null);

  const [powerUps, setPowerUps] = useState<PowerUp[]>([]);
  const [usedPowerUpIds, setUsedPowerUpIds] = useState<Set<string>>(new Set());
  const [selectedPowerUpId, setSelectedPowerUpId] = useState<string | null>(null);
  const [selectedLane, setSelectedLane] = useState<number | null>(null);
  const [powerUpError, setPowerUpError] = useState<string | null>(null);
  const pendingPowerUpIdRef = useRef<string | null>(null);

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

  // Live odds/status/race via socket.
  useEffect(() => {
    if (!session?.sessionToken) return;

    const socket = createGameSocket(session.sessionToken);
    socketRef.current = socket;

    socket.on('betting:opened', (payload: { raceId: string; odds: OddsSnapshot }) => {
      setRace({ id: payload.raceId, status: 'BETTING', odds: payload.odds });
      setConfirmedBet(null);
      setSelectedHorseId(null);
      setCountdown(null);
      setHorsePositions([]);
      setEvents([]);
      setStandings(null);
      setPayout(null);
      setResults(null);
      setPowerUps([]);
      setUsedPowerUpIds(new Set());
      setSelectedPowerUpId(null);
      setSelectedLane(null);
      setPowerUpError(null);
      pendingPowerUpIdRef.current = null;
    });

    socket.on('betting:closed', (payload: { raceId: string }) => {
      setRace((prev) =>
        prev && prev.id === payload.raceId ? { ...prev, status: 'BETTING_CLOSED' } : prev,
      );
    });

    socket.on('odds:updated', (payload: { raceId: string; odds: OddsSnapshot }) => {
      setRace((prev) => (prev && prev.id === payload.raceId ? { ...prev, odds: payload.odds } : prev));
    });

    socket.on('race:countdown', (payload: { raceId: string; count: number }) => {
      setRace((prev) => (prev ? { ...prev, status: 'COUNTDOWN' } : prev));
      setCountdown(payload.count);
    });

    socket.on('race:started', () => {
      setRace((prev) => (prev ? { ...prev, status: 'RACING' } : prev));
      setCountdown(null);
    });

    socket.on('race:update', (payload: { raceId: string; horses: RaceHorseSnapshot[] }) => {
      setHorsePositions(payload.horses);
    });

    socket.on('race:event', (payload: RaceEventPayload) => {
      setEvents((prev) => [payload, ...prev].slice(0, 30));
    });

    socket.on('race:finished', (payload: { raceId: string; standings: HorseFinish[] }) => {
      setRace((prev) => (prev ? { ...prev, status: 'RESULTS' } : prev));
      setStandings(payload.standings);

      // Public standings arrive first; fetch our own bet/payout right after
      // (server settles bets before broadcasting race:finished).
      fetch(`${API_URL}/races/${payload.raceId}/results`, {
        headers: session?.sessionToken ? { 'x-session-token': session.sessionToken } : {},
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setResults(data);
        })
        .catch(() => {});
    });

    socket.on('coins:updated', (payload: CoinsUpdatedPayload) => {
      setCoins(payload.coins);
      setPayout(payload);
    });

    socket.on('powerup:received', (payload: PowerUpReceivedPayload) => {
      setPowerUps(payload.powerUps);
    });

    // Server-authoritative: we optimistically mark a power-up used the
    // moment we emit `powerup:use` (see usePowerUp below); this just clears
    // the pending flag once the server confirms via race:event.
    socket.on('race:event', () => {
      pendingPowerUpIdRef.current = null;
    });

    socket.on('game:error', (payload: GameErrorPayload) => {
      setPowerUpError(payload.message);
      // Roll back the optimistic "used" mark if the server rejected our attempt.
      const pendingId = pendingPowerUpIdRef.current;
      if (pendingId) {
        setUsedPowerUpIds((prev) => {
          const next = new Set(prev);
          next.delete(pendingId);
          return next;
        });
        pendingPowerUpIdRef.current = null;
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session?.sessionToken, setCoins]);

  const maxBet = useMemo(() => {
    const coins = session?.coins ?? 0;
    return Math.max(BET_STEP, Math.floor(coins / BET_STEP) * BET_STEP);
  }, [session?.coins]);

  function usePowerUp(powerUpId: string) {
    if (!selectedLane || !socketRef.current) return;
    setPowerUpError(null);
    setUsedPowerUpIds((prev) => new Set(prev).add(powerUpId));
    pendingPowerUpIdRef.current = powerUpId;
    socketRef.current.emit('powerup:use', { powerupId: powerUpId, lane: selectedLane });
    setSelectedPowerUpId(null);
    setSelectedLane(null);
  }

  const horseNameByLane = useMemo(() => {
    const map = new Map<number, string>();
    race?.odds.horses.forEach((h) => map.set(h.lane, h.name));
    return map;
  }, [race]);

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

  const isTrackPhase =
    race && (race.status === 'COUNTDOWN' || race.status === 'RACING' || race.status === 'RESULTS');

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

      {isTrackPhase && (
        <div className="track-wrap">
          <div className="track">
            {race.odds.horses
              .slice()
              .sort((a, b) => a.lane - b.lane)
              .map((horse) => {
                const snap = horsePositions.find((h) => h.lane === horse.lane);
                const pct = snap ? Math.min(100, (snap.position / TRACK_LENGTH) * 100) : 0;
                const isMine = confirmedBet?.horseId === horse.horseId;

                return (
                  <div key={horse.lane} className="track-lane">
                    <span className="track-lane-label">
                      #{horse.lane} {horse.name}
                      {isMine ? ' 🎯' : ''}
                    </span>
                    <div className="track-lane-rail">
                      <span className="track-horse" style={{ left: `${pct}%` }}>
                        🐎
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>

          {race.status === 'RACING' && powerUps.length > 0 && (
            <div className="powerups-panel">
              <h2>Tus poderes</h2>
              {powerUpError && <p className="error">{powerUpError}</p>}
              <ul className="powerups-list">
                {powerUps.map((powerUp) => {
                  const info = POWER_UP_INFO[powerUp.type];
                  const isUsed = usedPowerUpIds.has(powerUp.id);
                  const isSelected = selectedPowerUpId === powerUp.id;

                  return (
                    <li key={powerUp.id} className="powerup-card">
                      <button
                        type="button"
                        className={`powerup-card-button${isSelected ? ' powerup-card-button--selected' : ''}`}
                        disabled={isUsed}
                        onClick={() => {
                          setPowerUpError(null);
                          setSelectedPowerUpId((prev) => (prev === powerUp.id ? null : powerUp.id));
                          setSelectedLane(null);
                        }}
                      >
                        <span className="powerup-emoji">{info.emoji}</span>
                        <span>{info.label}</span>
                        {isUsed && <span className="powerup-used-tag">usado</span>}
                      </button>

                      {isSelected && !isUsed && (
                        <div className="powerup-lane-picker">
                          {[1, 2, 3, 4, 5].map((lane) => (
                            <button
                              type="button"
                              key={lane}
                              className={`lane-pick${selectedLane === lane ? ' lane-pick--selected' : ''}`}
                              onClick={() => setSelectedLane(lane)}
                            >
                              #{lane}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="powerup-submit"
                            disabled={!selectedLane}
                            onClick={() => usePowerUp(powerUp.id)}
                          >
                            USAR
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {events.length > 0 && (
            <div className="event-feed">
              <h2>Eventos</h2>
              <ul>
                {events.map((event, i) => (
                  <li key={i}>{describeEvent(event, horseNameByLane)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {race && race.status === 'COUNTDOWN' && countdown !== null && (
        <div className="countdown-overlay">
          <span className="countdown-number">{countdown}</span>
        </div>
      )}

      {race && race.status === 'RESULTS' && standings && (
        <div className="results-panel">
          <h2>Resultados</h2>
          <ol className="standings-list">
            {standings
              .slice()
              .sort((a, b) => a.place - b.place)
              .map((finish) => (
                <li key={finish.lane} className="standings-row">
                  <span className="standings-place">{finish.place}°</span>
                  <span>
                    #{finish.lane} {horseNameByLane.get(finish.lane) ?? finish.horseId}
                  </span>
                </li>
              ))}
          </ol>

          {confirmedBet && !results && (
            <p className="race-status">Calculando tu pago...</p>
          )}

          {results?.myBet && (
            <div
              className={`payout-banner${
                results.myBet.payout && results.myBet.payout > 0
                  ? ' payout-banner--win'
                  : ' payout-banner--loss'
              }`}
            >
              {results.myBet.payout && results.myBet.payout > 0 ? (
                <p>GANASTE 🎉 +{results.myBet.payout} coins</p>
              ) : (
                <p>perdiste 😢 (apostaste {results.myBet.amount} coins)</p>
              )}
            </div>
          )}

          {payout?.reason === 'bailout' && (
            <div className="payout-banner payout-banner--bailout">
              <p>🏛️ Subsidio de coins del banco central. ¡Que la próxima corras mejor suerte!</p>
            </div>
          )}

          {payout && (
            <p className="badge-coins">Coins actuales: {payout.coins}</p>
          )}
        </div>
      )}
    </main>
  );
}

function describeEvent(event: RaceEventPayload, horseNameByLane: Map<number, string>): string {
  if (event.type === 'horse.finished') {
    const lane = event.lane as number;
    const place = event.place as number;
    const name = horseNameByLane.get(lane) ?? `Caballo #${lane}`;
    return `🏁 ${name} llegó en el puesto ${place}°`;
  }

  if (event.type.startsWith('powerup.')) {
    const lane = event.lane as number;
    const targetName = (event.horseName as string | null) ?? horseNameByLane.get(lane) ?? `carril ${lane}`;
    const player = (event.playerUsername as string) ?? 'Alguien';

    switch (event.type) {
      case 'powerup.turbo':
        return `⚡ ${player} le dio TURBO a ${targetName}`;
      case 'powerup.slow':
        return `🐌 ${player} ralentizó a ${targetName}`;
      case 'powerup.bomb':
        return `💣 ${player} bombardeó el carril ${lane} (${targetName})`;
      case 'powerup.shield':
        return `🛡️ ${player} protegió a ${targetName}`;
      case 'powerup.blocked':
        return `🛡️ ¡BLOQUEADA! ${targetName} estaba protegido del ataque de ${player}`;
      default:
        break;
    }
  }

  return `${event.type}: ${JSON.stringify(event)}`;
}
