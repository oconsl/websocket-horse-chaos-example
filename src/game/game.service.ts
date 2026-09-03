import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PowerUpType, RaceStatus, type Player } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { GameGateway } from './game.gateway.js';
import { PlaceBetDto } from './dto/place-bet.dto.js';
import { calculateOdds, type OddsSnapshot } from './odds.js';
import {
  RaceEngineService,
  RaceEngineHandle,
  type HorseFinish,
  type PowerUpEffectType,
  type RaceHorseSnapshot,
} from './race-engine.service.js';
import { PlayersService } from '../players/players.service.js';

/**
 * Weighted power-up pool for the 2 grants each player gets at RACING start.
 * TURBO/SLOW are common; BOMB/SHIELD are uncommon (the "counterplay" pair).
 */
const POWER_UP_POOL: { type: PowerUpType; weight: number }[] = [
  { type: PowerUpType.TURBO, weight: 35 },
  { type: PowerUpType.SLOW, weight: 35 },
  { type: PowerUpType.BOMB, weight: 15 },
  { type: PowerUpType.SHIELD, weight: 15 },
];

function pickWeightedPowerUp(): PowerUpType {
  const totalWeight = POWER_UP_POOL.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of POWER_UP_POOL) {
    if (roll < entry.weight) return entry.type;
    roll -= entry.weight;
  }
  return POWER_UP_POOL[0].type;
}

/**
 * Narrow view of GameGateway used only so this constructor param's TYPE
 * annotation doesn't force TS's emitDecoratorMetadata to eagerly reference
 * the (circularly-imported) GameGateway class at module-eval time — see the
 * matching comment in game.gateway.ts.
 */
interface GameGatewayPort {
  emitBettingOpened(payload: { raceId: string; odds: OddsSnapshot }): void;
  emitBettingClosed(payload: { raceId: string }): void;
  emitOddsUpdated(payload: { raceId: string; odds: OddsSnapshot }): void;
  emitRaceCountdown(payload: { raceId: string; count: number }): void;
  emitRaceStarted(payload: { raceId: string }): void;
  emitRaceEvent(payload: { raceId: string; type: string; [key: string]: unknown }): void;
  emitRaceFinished(payload: { raceId: string; standings: HorseFinish[] }): void;
  emitCoinsUpdatedTo(
    socketIds: string[],
    payload: { coins: number; reason: 'race_payout' | 'bailout' },
  ): void;
  emitPowerUpsReceivedTo(
    socketIds: string[],
    payload: { raceId: string; powerUps: { id: string; type: string }[] },
  ): void;
  emitLeaderboardUpdated(payload: {
    leaderboard: { rank: number; playerId: string; username: string; coins: number }[];
  }): void;
}

/** Countdown broadcast before RACING begins, server-timed (no admin click). */
const COUNTDOWN_FROM = 3;
const COUNTDOWN_TICK_MS = 1000;
/** Flat subsidy so a player who bottoms out at 0 coins can keep playing. */
const BAILOUT_AMOUNT = 300;

const HORSE_ROSTER = [
  { name: 'El Backend', speed: 55, acceleration: 45, stamina: 60, chaos: 20 },
  { name: 'NullPointer', speed: 40, acceleration: 65, stamina: 35, chaos: 70 },
  { name: 'CSS Master', speed: 50, acceleration: 50, stamina: 50, chaos: 50 },
  { name: 'Segmentation Fault', speed: 70, acceleration: 30, stamina: 45, chaos: 60 },
  { name: 'localhost:3000', speed: 45, acceleration: 55, stamina: 65, chaos: 30 },
];

@Injectable()
export class GameService implements OnModuleInit {
  private readonly logger = new Logger(GameService.name);
  /** In-memory pointer to the single race "in flight" — no concurrent races this phase. */
  private currentRaceId: string | null = null;
  /** Live handle into the running simulation, set for the duration of RACING only — lets `powerup:use` mutate it. */
  private currentRaceEngineHandle: RaceEngineHandle | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => GameGateway))
    private readonly gameGateway: GameGatewayPort,
    private readonly raceEngine: RaceEngineService,
    private readonly playersService: PlayersService,
  ) {}

  async onModuleInit() {
    await this.seedHorses();
  }

  private async seedHorses() {
    for (const horse of HORSE_ROSTER) {
      await this.prisma.horse.upsert({
        where: { name: horse.name },
        update: {},
        create: horse,
      });
    }
    this.logger.log(`Seeded ${HORSE_ROSTER.length} horses`);
  }

  async createRace() {
    const horses = await this.prisma.horse.findMany({
      orderBy: { name: 'asc' },
      take: 5,
    });

    if (horses.length < 5) {
      throw new BadRequestException('Not enough horses seeded to create a race');
    }

    const race = await this.prisma.race.create({
      data: {
        seed: randomUUID(),
        status: RaceStatus.WAITING,
        horses: {
          create: horses.map((horse, index) => ({
            horseId: horse.id,
            lane: index + 1,
          })),
        },
      },
      include: { horses: { include: { horse: true }, orderBy: { lane: 'asc' } } },
    });

    this.currentRaceId = race.id;
    return this.buildRaceSnapshot(race.id);
  }

  async openBetting(raceId: string) {
    const race = await this.getRaceOrThrow(raceId);

    if (race.status !== RaceStatus.WAITING) {
      throw new BadRequestException(
        `Cannot open betting from status ${race.status}`,
      );
    }

    await this.prisma.race.update({
      where: { id: raceId },
      data: { status: RaceStatus.BETTING },
    });
    this.currentRaceId = raceId;

    const snapshot = await this.buildRaceSnapshot(raceId);
    this.gameGateway.emitBettingOpened({ raceId, odds: snapshot.odds });
    return snapshot;
  }

  async closeBetting(raceId: string) {
    const race = await this.getRaceOrThrow(raceId);

    if (race.status !== RaceStatus.BETTING) {
      throw new BadRequestException(
        `Cannot close betting from status ${race.status}`,
      );
    }

    // Snapshot odds now — payouts settle against THIS snapshot, never against
    // odds that could keep moving (they can't once betting is closed, but
    // freezing it explicitly keeps settlement independent of live recompute).
    const snapshot = await this.buildRaceSnapshot(raceId);

    await this.prisma.race.update({
      where: { id: raceId },
      data: { status: RaceStatus.BETTING_CLOSED, finalOdds: snapshot.odds as unknown as object },
    });

    this.gameGateway.emitBettingClosed({ raceId });
    return this.buildRaceSnapshot(raceId);
  }

  async startRace(raceId: string) {
    const race = await this.getRaceOrThrow(raceId);

    if (race.status !== RaceStatus.BETTING_CLOSED) {
      throw new BadRequestException(
        `Cannot start race from status ${race.status}`,
      );
    }

    await this.prisma.race.update({
      where: { id: raceId },
      data: { status: RaceStatus.COUNTDOWN },
    });

    // Countdown + simulation run on the server's own clock, not another
    // admin click — kick it off and let the caller move on immediately.
    void this.runCountdownAndRace(raceId).catch((err) => {
      this.logger.error(`Race ${raceId} failed mid-flight`, err);
    });

    return this.buildRaceSnapshot(raceId);
  }

  private async runCountdownAndRace(raceId: string) {
    for (let count = COUNTDOWN_FROM; count >= 1; count--) {
      this.gameGateway.emitRaceCountdown({ raceId, count });
      await sleep(COUNTDOWN_TICK_MS);
    }

    const race = await this.prisma.race.update({
      where: { id: raceId },
      data: { status: RaceStatus.RACING, startedAt: new Date() },
      include: { horses: { include: { horse: true }, orderBy: { lane: 'asc' } } },
    });
    this.gameGateway.emitRaceStarted({ raceId });

    // Grant power-ups right as RACING begins — after countdown, before the
    // sim loop starts, so every connected player has them for the whole race.
    await this.grantPowerUps(raceId);

    try {
      const finishes = await this.raceEngine.runRace(
        raceId,
        race.seed,
        race.horses.map((rh) => ({
          horseId: rh.horseId,
          lane: rh.lane,
          speed: rh.horse.speed,
          acceleration: rh.horse.acceleration,
          stamina: rh.horse.stamina,
          chaos: rh.horse.chaos,
        })),
        (handle) => {
          this.currentRaceEngineHandle = handle;
        },
      );

      await this.finishRace(raceId, finishes);
    } finally {
      this.currentRaceEngineHandle = null;
    }
  }

  /** Grants each connected player 2 random power-ups for this race, persisted and pushed via socket. */
  private async grantPowerUps(raceId: string) {
    const players = this.playersService.getConnectedPlayers();

    for (const player of players) {
      const types = [pickWeightedPowerUp(), pickWeightedPowerUp()];
      const created = await this.prisma.$transaction(
        types.map((type) =>
          this.prisma.playerPowerUp.create({
            data: { playerId: player.playerId, raceId, type },
          }),
        ),
      );

      const socketIds = this.playersService.getSocketIdsForPlayer(player.playerId);
      this.gameGateway.emitPowerUpsReceivedTo(socketIds, {
        raceId,
        powerUps: created.map((p) => ({ id: p.id, type: p.type })),
      });
    }
  }

  /**
   * Server-authoritative power-up usage. The client sends only
   * `{ powerupId, lane }` — everything about *what the power-up does* is
   * decided here and in RaceEngineHandle, never on the client.
   */
  async usePowerUp(playerId: string, dto: { powerupId: string; lane: number }) {
    if (!this.currentRaceId) {
      throw new BadRequestException('No race in progress');
    }
    const raceId = this.currentRaceId;

    const race = await this.prisma.race.findUnique({ where: { id: raceId } });
    if (!race || race.status !== RaceStatus.RACING) {
      throw new BadRequestException('Power-ups can only be used while the race is running');
    }

    const handle = this.currentRaceEngineHandle;
    if (!handle) {
      throw new BadRequestException('Race simulation is not active');
    }

    const powerUp = await this.prisma.playerPowerUp.findUnique({
      where: { id: dto.powerupId },
    });
    if (!powerUp || powerUp.raceId !== raceId) {
      throw new BadRequestException('Power-up not found for this race');
    }
    if (powerUp.playerId !== playerId) {
      throw new BadRequestException('This power-up does not belong to you');
    }
    if (powerUp.used) {
      throw new BadRequestException('Power-up already used');
    }
    if (!Number.isInteger(dto.lane) || dto.lane < 1 || dto.lane > 5 || !handle.hasLane(dto.lane)) {
      throw new BadRequestException('Invalid target lane');
    }
    if (handle.isFinished(dto.lane)) {
      throw new BadRequestException('That horse has already finished');
    }

    const result = handle.applyEffect(dto.lane, powerUp.type as PowerUpEffectType, Date.now());

    await this.prisma.playerPowerUp.update({
      where: { id: powerUp.id },
      data: { used: true, targetLane: dto.lane, usedAt: new Date() },
    });

    const [player, raceHorse] = await Promise.all([
      this.prisma.player.findUnique({ where: { id: playerId } }),
      this.prisma.raceHorse.findUnique({
        where: { raceId_lane: { raceId, lane: dto.lane } },
        include: { horse: true },
      }),
    ]);

    const eventType = result === 'blocked' ? 'powerup.blocked' : `powerup.${powerUp.type.toLowerCase()}`;

    this.gameGateway.emitRaceEvent({
      raceId,
      type: eventType,
      powerUpType: powerUp.type,
      lane: dto.lane,
      horseName: raceHorse?.horse.name ?? null,
      playerId,
      playerUsername: player?.username ?? 'Jugador',
    });

    return { result };
  }

  private async finishRace(raceId: string, finishes: HorseFinish[]) {
    const race = await this.prisma.race.findUniqueOrThrow({ where: { id: raceId } });
    const finalOdds = race.finalOdds as unknown as OddsSnapshot;
    const winnerLane = finishes.find((f) => f.place === 1);
    const winnerOdds = winnerLane
      ? finalOdds.horses.find((h) => h.lane === winnerLane.lane)
      : undefined;

    const bets = await this.prisma.bet.findMany({ where: { raceId } });

    const bailouts: string[] = [];
    const payoutsByPlayer = new Map<string, number>();

    await this.prisma.$transaction(async (tx) => {
      // Persist finish order.
      for (const finish of finishes) {
        await tx.raceHorse.update({
          where: { raceId_horseId: { raceId, horseId: finish.horseId } },
          data: { finishPosition: finish.place },
        });
      }

      // Settle every bet against the odds snapshotted at BETTING_CLOSED.
      for (const bet of bets) {
        const isWinner = winnerLane && bet.horseId === winnerLane.horseId;
        const payout = isWinner && winnerOdds?.odds ? Math.round(bet.amount * winnerOdds.odds) : 0;

        await tx.bet.update({ where: { id: bet.id }, data: { payout } });

        if (payout > 0) {
          await tx.player.update({
            where: { id: bet.playerId },
            data: { coins: { increment: payout } },
          });
          payoutsByPlayer.set(bet.playerId, (payoutsByPlayer.get(bet.playerId) ?? 0) + payout);
        }
      }

      // "Too big to fail": nobody stays parked at 0 coins.
      const bettingPlayerIds = [...new Set(bets.map((b) => b.playerId))];
      const players = await tx.player.findMany({ where: { id: { in: bettingPlayerIds } } });
      for (const player of players) {
        if (player.coins === 0) {
          await tx.player.update({
            where: { id: player.id },
            data: { coins: { increment: BAILOUT_AMOUNT } },
          });
          bailouts.push(player.id);
        }
      }

      await tx.race.update({
        where: { id: raceId },
        data: { status: RaceStatus.RESULTS, finishedAt: new Date() },
      });
    });

    // Notify each affected player on their own socket(s) only.
    for (const [playerId, payout] of payoutsByPlayer) {
      const player = await this.prisma.player.findUnique({ where: { id: playerId } });
      if (!player) continue;
      this.gameGateway.emitCoinsUpdatedTo(this.playersService.getSocketIdsForPlayer(playerId), {
        coins: player.coins,
        reason: 'race_payout',
      });
      this.logger.log(`Player ${playerId} won ${payout} coins on race ${raceId}`);
    }
    for (const playerId of bailouts) {
      const player = await this.prisma.player.findUnique({ where: { id: playerId } });
      if (!player) continue;
      this.gameGateway.emitCoinsUpdatedTo(this.playersService.getSocketIdsForPlayer(playerId), {
        coins: player.coins,
        reason: 'bailout',
      });
    }

    this.gameGateway.emitRaceFinished({
      raceId,
      standings: finishes.slice().sort((a, b) => a.place - b.place),
    });

    // Standings can shift after every race's payouts settle — refresh live
    // for anyone with the leaderboard open.
    const leaderboard = await this.getLeaderboard();
    this.gameGateway.emitLeaderboardUpdated({ leaderboard });
  }

  /** Top players by coins, descending. Public — no auth required. */
  async getLeaderboard(limit = 20) {
    const players = await this.prisma.player.findMany({
      orderBy: { coins: 'desc' },
      take: limit,
      select: { id: true, username: true, coins: true },
    });

    return players.map((player, index) => ({
      rank: index + 1,
      playerId: player.id,
      username: player.username,
      coins: player.coins,
    }));
  }

  /**
   * Session resume (design doc §16): everything a reconnecting player needs
   * to rehydrate their view without waiting for the next live tick. Entirely
   * read from server state keyed by playerId — the client never asserts its
   * own coins/bet/power-ups, it only ever receives this snapshot.
   */
  async getResumeSnapshot(playerId: string) {
    if (!this.currentRaceId) {
      return { race: null, myBet: null, powerUps: [], horsePositions: [], results: null };
    }

    const raceId = this.currentRaceId;
    const snapshot = await this.buildRaceSnapshot(raceId);

    const [bet, powerUps] = await Promise.all([
      this.prisma.bet.findUnique({ where: { playerId_raceId: { playerId, raceId } } }),
      this.prisma.playerPowerUp.findMany({
        where: { playerId, raceId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const horsePositions: RaceHorseSnapshot[] =
      snapshot.status === RaceStatus.RACING && this.currentRaceEngineHandle
        ? this.currentRaceEngineHandle.snapshot()
        : [];

    let results: Awaited<ReturnType<GameService['getRaceResults']>> | null = null;
    if (snapshot.status === RaceStatus.RESULTS) {
      const player = await this.prisma.player.findUnique({ where: { id: playerId } });
      results = await this.getRaceResults(raceId, player);
    }

    return {
      race: { id: snapshot.id, status: snapshot.status, odds: snapshot.odds },
      myBet: bet ? { horseId: bet.horseId, amount: bet.amount } : null,
      powerUps: powerUps.map((p) => ({ id: p.id, type: p.type, used: p.used })),
      horsePositions,
      results,
    };
  }

  async getRaceResults(raceId: string, player: Player | null) {
    const race = await this.prisma.race.findUnique({
      where: { id: raceId },
      include: { horses: { include: { horse: true }, orderBy: { lane: 'asc' } } },
    });
    if (!race) {
      throw new NotFoundException('Race not found');
    }
    if (race.status !== RaceStatus.RESULTS) {
      throw new BadRequestException('Race has not finished yet');
    }

    const standings = race.horses
      .filter((rh) => rh.finishPosition !== null)
      .sort((a, b) => (a.finishPosition ?? 0) - (b.finishPosition ?? 0))
      .map((rh) => ({
        lane: rh.lane,
        horseId: rh.horseId,
        name: rh.horse.name,
        place: rh.finishPosition,
      }));

    let myBet: { horseId: string; amount: number; payout: number | null } | null = null;
    if (player) {
      const bet = await this.prisma.bet.findUnique({
        where: { playerId_raceId: { playerId: player.id, raceId } },
      });
      if (bet) {
        myBet = { horseId: bet.horseId, amount: bet.amount, payout: bet.payout };
      }
    }

    return { raceId, status: race.status, standings, myBet };
  }

  async getCurrentRace() {
    if (!this.currentRaceId) {
      return null;
    }
    return this.buildRaceSnapshot(this.currentRaceId);
  }

  async placeBet(raceId: string, player: Player, dto: PlaceBetDto) {
    const race = await this.getRaceOrThrow(raceId);

    if (race.status !== RaceStatus.BETTING) {
      throw new BadRequestException('Betting is not open for this race');
    }

    const raceHorse = await this.prisma.raceHorse.findUnique({
      where: { raceId_horseId: { raceId, horseId: dto.horseId } },
    });
    if (!raceHorse) {
      throw new BadRequestException('That horse is not running in this race');
    }

    const existingBet = await this.prisma.bet.findUnique({
      where: { playerId_raceId: { playerId: player.id, raceId } },
    });
    if (existingBet) {
      throw new ConflictException('You already placed a bet on this race');
    }

    if (dto.amount > player.coins) {
      throw new BadRequestException('Insufficient coins');
    }

    const bet = await this.prisma.$transaction(async (tx) => {
      // Guard the balance atomically in case of a racing duplicate request.
      const deducted = await tx.player.updateMany({
        where: { id: player.id, coins: { gte: dto.amount } },
        data: { coins: { decrement: dto.amount } },
      });
      if (deducted.count === 0) {
        throw new BadRequestException('Insufficient coins');
      }

      return tx.bet.create({
        data: {
          playerId: player.id,
          raceId,
          horseId: dto.horseId,
          amount: dto.amount,
        },
      });
    });

    const snapshot = await this.buildRaceSnapshot(raceId);
    this.gameGateway.emitOddsUpdated({ raceId, odds: snapshot.odds });

    return { bet, odds: snapshot.odds };
  }

  private async getRaceOrThrow(raceId: string) {
    const race = await this.prisma.race.findUnique({ where: { id: raceId } });
    if (!race) {
      throw new NotFoundException('Race not found');
    }
    return race;
  }

  private async buildRaceSnapshot(raceId: string) {
    const race = await this.prisma.race.findUniqueOrThrow({
      where: { id: raceId },
      include: { horses: { include: { horse: true }, orderBy: { lane: 'asc' } } },
    });

    const pools = await this.prisma.bet.groupBy({
      by: ['horseId'],
      where: { raceId },
      _sum: { amount: true },
    });
    const poolByHorseId = new Map(pools.map((p) => [p.horseId, p._sum.amount ?? 0]));

    const odds: OddsSnapshot = calculateOdds(
      race.horses.map((rh) => ({
        horseId: rh.horseId,
        name: rh.horse.name,
        lane: rh.lane,
        pool: poolByHorseId.get(rh.horseId) ?? 0,
      })),
    );

    return {
      id: race.id,
      status: race.status,
      seed: race.seed,
      startedAt: race.startedAt,
      finishedAt: race.finishedAt,
      odds,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
