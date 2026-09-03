import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSessionDto } from './dto/create-session.dto.js';

const STARTING_COINS = 1000;

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(dto: CreateSessionDto) {
    const player = await this.prisma.player.create({
      data: {
        username: dto.username,
        sessionToken: randomUUID(),
        coins: STARTING_COINS,
      },
    });

    return {
      playerId: player.id,
      username: player.username,
      coins: player.coins,
      sessionToken: player.sessionToken,
    };
  }
}
