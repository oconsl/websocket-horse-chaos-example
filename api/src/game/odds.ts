export interface HorsePoolInput {
  horseId: string;
  name: string;
  lane: number;
  pool: number;
}

export interface HorseOdds {
  horseId: string;
  name: string;
  lane: number;
  pool: number;
  /** Pari-mutuel multiplier (totalPool / pool on this horse), or null with no bets yet. */
  odds: number | null;
}

export interface OddsSnapshot {
  totalPool: number;
  horses: HorseOdds[];
}

/**
 * Classic pari-mutuel odds: odds_for_horse = totalPool / poolOnThatHorse.
 * With zero bets on a horse (or on the whole race) there's nothing to divide
 * by, so we report `odds: null` rather than Infinity/NaN — the frontend
 * renders that as a placeholder ("—") until real money is on the board.
 */
export function calculateOdds(horses: HorsePoolInput[]): OddsSnapshot {
  const totalPool = horses.reduce((sum, h) => sum + h.pool, 0);

  return {
    totalPool,
    horses: horses.map((h) => ({
      horseId: h.horseId,
      name: h.name,
      lane: h.lane,
      pool: h.pool,
      odds: h.pool > 0 ? totalPool / h.pool : null,
    })),
  };
}
