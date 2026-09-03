import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Player } from '@prisma/client';

/** Reads the player attached by PlayerAuthGuard onto the request. */
export const CurrentPlayer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Player => {
    const request = ctx.switchToHttp().getRequest<Request & { player: Player }>();
    return request.player;
  },
);
