import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSessionDto } from './dto/create-session.dto.js';
import { hashPassword, verifyPassword } from './password.util.js';

const STARTING_COINS = 1000;

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: CreateSessionDto) {
    const existing = await this.prisma.player.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException('Ese nombre de usuario ya existe');
    }

    const player = await this.prisma.player.create({
      data: {
        username: dto.username,
        passwordHash: await hashPassword(dto.password),
        sessionToken: randomUUID(),
        coins: STARTING_COINS,
      },
    });

    return this.toSessionResponse(player);
  }

  async login(dto: CreateSessionDto) {
    const player = await this.prisma.player.findUnique({ where: { username: dto.username } });
    const valid = player && (await verifyPassword(dto.password, player.passwordHash));
    if (!player || !valid) {
      throw new UnauthorizedException('Usuario o contraseña inválidos');
    }

    // Rotate the session token on every login.
    const updated = await this.prisma.player.update({
      where: { id: player.id },
      data: { sessionToken: randomUUID() },
    });

    return this.toSessionResponse(updated);
  }

  private toSessionResponse(player: {
    id: string;
    username: string;
    coins: number;
    sessionToken: string;
  }) {
    return {
      playerId: player.id,
      username: player.username,
      coins: player.coins,
      sessionToken: player.sessionToken,
    };
  }
}
