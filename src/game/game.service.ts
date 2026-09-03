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

    await this.prisma.race.update({
      where: { id: raceId },
      data: { status: RaceStatus.BETTING_CLOSED },
    });

    this.gameGateway.emitBettingClosed({ raceId });
    return this.buildRaceSnapshot(raceId);
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
