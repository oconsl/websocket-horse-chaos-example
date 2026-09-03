import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Same `x-session-token` handshake as PlayerAuthGuard, plus an `isAdmin`
 * check. Kept as its own guard (rather than PlayerAuthGuard + a manual
 * check per-route) so admin routes fail closed by construction.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sessionToken = request.headers['x-session-token'] as string | undefined;

    if (!sessionToken) {
      throw new UnauthorizedException('Missing x-session-token header');
    }

    const player = await this.prisma.player.findUnique({
      where: { sessionToken },
    });

    if (!player) {
      throw new UnauthorizedException('Invalid sessionToken');
    }

    if (!player.isAdmin) {
      throw new ForbiddenException('Admin access required');
    }

    (request as Request & { player: typeof player }).player = player;
    return true;
  }
}
