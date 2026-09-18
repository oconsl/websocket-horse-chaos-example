import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Resolves the calling player from the `x-session-token` header, mirroring
 * the sessionToken handshake auth used by PlayersGateway for sockets.
 * Attaches the resolved player to `request.player` for `@CurrentPlayer()`.
 */
@Injectable()
export class PlayerAuthGuard implements CanActivate {
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

    (request as Request & { player: typeof player }).player = player;
    return true;
  }
}
