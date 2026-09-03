import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RaceStatus, type Player } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { GameGateway } from './game.gateway.js';
import { PlaceBetDto } from './dto/place-bet.dto.js';
import { calculateOdds, type OddsSnapshot } from './odds.js';
import { RaceEngineService, type HorseFinish } from './race-engine.service.js';
import { PlayersService } from '../players/players.service.js';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameGateway: GameGateway,
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
    );

    await this.finishRace(raceId, finishes);
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
