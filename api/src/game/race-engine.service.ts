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
  /** Velocity actually applied last tick (base velocity with power-up multipliers/fatigue folded in) — what we broadcast. */
  effectiveVelocity: number;
  finished: boolean;
}

export type PowerUpEffectType = 'TURBO' | 'SLOW' | 'BOMB' | 'SHIELD';

interface ActiveEffect {
  type: PowerUpEffectType;
  expiresAt: number;
}

/** +30% speed for 3s. */
const TURBO_MULTIPLIER = 1.3;
const TURBO_DURATION_MS = 3000;
/** -25% speed for 3s. */
const SLOW_MULTIPLIER = 0.75;
const SLOW_DURATION_MS = 3000;
/** Brief stun (speed=0) plus a flat position knockback. */
const BOMB_STUN_MS = 1000;
const BOMB_KNOCKBACK = 25;
/** Blocks TURBO/SLOW/BOMB while active. */
const SHIELD_DURATION_MS = 4000;

/**
 * Live per-race handle the gateway hands out to `GameService` so a
 * `powerup:use` event landing mid-simulation can mutate the running race
 * (rather than the finished promise this method already returns). One
 * instance per in-flight race; discarded once `runRace` resolves.
 */
export class RaceEngineHandle {
  /** lane -> effects currently in flight for that horse, each tagged with an absolute expiry timestamp. */
  private readonly effectsByLane = new Map<number, ActiveEffect[]>();

  constructor(private readonly state: HorseRunState[]) {}

  hasLane(lane: number): boolean {
    return this.state.some((h) => h.lane === lane);
  }

  isFinished(lane: number): boolean {
    return this.state.find((h) => h.lane === lane)?.finished ?? true;
  }

  isShielded(lane: number, now: number): boolean {
    const effects = this.effectsByLane.get(lane);
    if (!effects) return false;
    return effects.some((e) => e.type === 'SHIELD' && e.expiresAt > now);
  }

  /**
   * Applies a power-up to a lane. Returns `'blocked'` when an active SHIELD
   * absorbed a TURBO/SLOW/BOMB (SHIELD itself is never blocked). Returns
   * `'applied'` otherwise, mutating the running simulation state directly —
   * timed effects (TURBO/SLOW/SHIELD) are picked up by the next tick, and
   * BOMB's knockback is instantaneous.
   */
  applyEffect(lane: number, type: PowerUpEffectType, now: number): 'applied' | 'blocked' {
    if (type !== 'SHIELD' && this.isShielded(lane, now)) {
      return 'blocked';
    }

    const effects = this.effectsByLane.get(lane) ?? [];
    const expiresAt =
      type === 'TURBO'
        ? now + TURBO_DURATION_MS
        : type === 'SLOW'
          ? now + SLOW_DURATION_MS
          : type === 'BOMB'
            ? now + BOMB_STUN_MS
            : now + SHIELD_DURATION_MS;

    effects.push({ type, expiresAt });
    this.effectsByLane.set(lane, effects);

    if (type === 'BOMB') {
      const horse = this.state.find((h) => h.lane === lane);
      if (horse) {
        horse.position = Math.max(0, horse.position - BOMB_KNOCKBACK);
        horse.velocity = 0;
      }
    }

    return 'applied';
  }

  /** Prunes expired effects and returns the still-active ones for a lane at `now`. */
  activeEffects(lane: number, now: number): ActiveEffect[] {
    const effects = this.effectsByLane.get(lane);
    if (!effects) return [];
    const live = effects.filter((e) => e.expiresAt > now);
    this.effectsByLane.set(lane, live);
    return live;
  }

  /**
   * Current live positions for every lane — used to rehydrate a reconnecting
   * player mid-race instead of leaving their track blank until the next
   * `race:update` tick.
   */
  snapshot(): RaceHorseSnapshot[] {
    return this.state.map((h) => ({
      lane: h.lane,
      position: Math.round(h.position * 100) / 100,
      speed: Math.round(h.effectiveVelocity * 100) / 100,
    }));
  }
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

  /**
   * @param onHandleReady Invoked synchronously with a `RaceEngineHandle` for
   * this run before the simulation loop starts, so the caller (GameService)
   * can stash it and apply power-ups mid-race via `powerup:use`. The handle
   * is only valid for the lifetime of this call.
   */
  async runRace(
    raceId: string,
    seed: string,
    horses: RaceHorseInput[],
    onHandleReady?: (handle: RaceEngineHandle) => void,
  ): Promise<HorseFinish[]> {
    const rng = mulberry32(hashSeed(seed));
    const state: HorseRunState[] = horses.map((h) => ({
      ...h,
      position: 0,
      velocity: 0,
      effectiveVelocity: 0,
      finished: false,
    }));

    const handle = new RaceEngineHandle(state);
    onHandleReady?.(handle);

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
        let effectiveVelocity = Math.max(horse.velocity * (1 - fatigue), 0.2);

        // Power-up effects (phase 4): applied on top of the base sim, never
        // stored back into horse.velocity so they naturally wear off at expiry.
        const now = Date.now();
        for (const effect of handle.activeEffects(horse.lane, now)) {
          if (effect.type === 'BOMB') {
            effectiveVelocity = 0;
          } else if (effect.type === 'TURBO') {
            effectiveVelocity *= TURBO_MULTIPLIER;
          } else if (effect.type === 'SLOW') {
            effectiveVelocity *= SLOW_MULTIPLIER;
          }
        }

        horse.effectiveVelocity = effectiveVelocity;
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
            speed: Math.round(h.effectiveVelocity * 100) / 100,
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
        speed: Math.round(h.effectiveVelocity * 100) / 100,
      })),
    });

    return finishes;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
