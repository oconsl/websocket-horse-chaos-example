import { Injectable, Logger } from '@nestjs/common';
import { GameGateway } from './game.gateway.js';

/** Arbitrary track-length units — not meters, just a fixed race distance. */
const TRACK_LENGTH = 1000;
/** Internal simulation step. Deliberately finer than what we broadcast. */
const TICK_MS = 50;
/** Broadcast a `race:update` snapshot every Nth tick (~100ms). */
const EMIT_EVERY_N_TICKS = 2;
/** Safety valve so a pathological seed/stat combo can't spin forever. */
const MAX_TICKS = 20_000;

export interface RaceHorseInput {
  horseId: string;
  lane: number;
  speed: number;
  acceleration: number;
  stamina: number;
  chaos: number;
}

export interface RaceHorseSnapshot {
  lane: number;
  position: number;
  speed: number;
}

export interface HorseFinish {
  horseId: string;
  lane: number;
  place: number;
}

interface HorseRunState extends RaceHorseInput {
  position: number;
  velocity: number;
  finished: boolean;
}

/** Deterministic string seed -> 32-bit int seed for mulberry32. */
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** Small, fast seeded PRNG — reproducible per race.seed, no external deps. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Server-authoritative race simulator. Ticks internally at TICK_MS, mostly
 * driven by seeded RNG ("acá empieza el caos") with a deliberately SMALL
 * nudge from each horse's stats so the fastest horse on paper does not
 * automatically win. Emits `race:update`/`race:event` live via GameGateway
 * as the race unfolds, and resolves with the final finish order once every
 * horse has crossed the line — persistence/settlement is the caller's job.
 */
@Injectable()
export class RaceEngineService {
  private readonly logger = new Logger(RaceEngineService.name);

  constructor(private readonly gameGateway: GameGateway) {}

  async runRace(raceId: string, seed: string, horses: RaceHorseInput[]): Promise<HorseFinish[]> {
    const rng = mulberry32(hashSeed(seed));
    const state: HorseRunState[] = horses.map((h) => ({
      ...h,
      position: 0,
      velocity: 0,
      finished: false,
    }));

    const finishes: HorseFinish[] = [];
    let tick = 0;

    while (finishes.length < state.length && tick < MAX_TICKS) {
      tick++;
      const progress = tick / 400; // rough normalized progress, used only for fatigue ramp

      for (const horse of state) {
        if (horse.finished) continue;

        // Small stat nudges — kept deliberately tiny relative to the RNG term.
        const statNudge = (horse.speed - 50) / 50 / 3; // +-~0.33
        const chaosVariance = 0.5 + horse.chaos / 100; // ~0.7 - 1.5
        const noise = (rng() - 0.5) * 2 * chaosVariance;

        const targetVelocity = 2.5 + statNudge + noise;
        const accelRate = 0.1 + (horse.acceleration / 100) * 0.15;
        horse.velocity += (targetVelocity - horse.velocity) * accelRate;

        // Late-race fatigue: low-stamina horses lose a bit of pace near the end.
        const fatigue = Math.max(0, progress - 0.6) * (1 - horse.stamina / 100) * 1.5;
        const effectiveVelocity = Math.max(horse.velocity * (1 - fatigue), 0.2);

        horse.position = Math.min(horse.position + effectiveVelocity, TRACK_LENGTH);

        if (horse.position >= TRACK_LENGTH && !horse.finished) {
          horse.finished = true;
          const place = finishes.length + 1;
          finishes.push({ horseId: horse.horseId, lane: horse.lane, place });
          this.gameGateway.emitRaceEvent({
            raceId,
            type: 'horse.finished',
            lane: horse.lane,
            place,
          });
        }
      }

      if (tick % EMIT_EVERY_N_TICKS === 0) {
        this.gameGateway.emitRaceUpdate({
          raceId,
          horses: state.map((h) => ({
            lane: h.lane,
            position: Math.round(h.position * 100) / 100,
            speed: Math.round(h.velocity * 100) / 100,
          })),
        });
      }

      await sleep(TICK_MS);
    }

    if (finishes.length < state.length) {
      this.logger.warn(`Race ${raceId} hit MAX_TICKS without every horse finishing`);
      // Force-finish any stragglers in current position order so the race can still resolve.
      for (const horse of state.filter((h) => !h.finished)) {
        const place = finishes.length + 1;
        finishes.push({ horseId: horse.horseId, lane: horse.lane, place });
      }
    }

    // Final snapshot so clients see everyone parked at the finish line.
    this.gameGateway.emitRaceUpdate({
      raceId,
      horses: state.map((h) => ({
        lane: h.lane,
        position: Math.round(h.position * 100) / 100,
        speed: Math.round(h.velocity * 100) / 100,
      })),
    });

    return finishes;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
