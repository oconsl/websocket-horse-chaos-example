import { forwardRef, Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { OddsSnapshot } from './odds.js';
import type { RaceHorseSnapshot, HorseFinish } from './race-engine.service.js';
import { GameService } from './game.service.js';
import { PlayersService } from '../players/players.service.js';

/**
 * Focused gateway for race/betting broadcasts. Shares the same underlying
 * Socket.IO server instance as PlayersGateway (no explicit namespace/port),
 * so events land on the same clients that receive `lobby:update`.
 */
/**
 * Narrow view of GameService used only so this constructor param's TYPE
 * annotation doesn't force TS's emitDecoratorMetadata to eagerly reference
 * the (circularly-imported) GameService class at module-eval time — that
 * would hit a TDZ error under ESM. `forwardRef` below still supplies the
 * real class lazily for Nest's DI container.
 */
interface UsePowerUpPort {
  usePowerUp(
    playerId: string,
    dto: { powerupId: string; lane: number },
  ): Promise<{ result: 'applied' | 'blocked' }>;
}

@WebSocketGateway({
  cors: { origin: '*' },
})
export class GameGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(forwardRef(() => GameService))
    private readonly gameService: UsePowerUpPort,
    private readonly playersService: PlayersService,
  ) {}

  /**
   * Server-authoritative power-up usage: the client sends ONLY the powerup
   * id and a target lane — every effect (type, magnitude, duration) is
   * decided and applied entirely server-side in GameService/RaceEngineService.
   */
  @SubscribeMessage('powerup:use')
  async handlePowerUpUse(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { powerupId?: string; lane?: number },
  ) {
    const playerId = this.playersService.getPlayerIdForSocket(client.id);
    if (!playerId) {
      client.emit('game:error', { message: 'Not authenticated' });
      return;
    }

    try {
      await this.gameService.usePowerUp(playerId, {
        powerupId: body?.powerupId ?? '',
        lane: body?.lane ?? -1,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo usar el poder';
      client.emit('game:error', { message });
    }
  }

  emitBettingOpened(payload: { raceId: string; odds: OddsSnapshot }) {
    this.server.emit('betting:opened', payload);
  }

  emitBettingClosed(payload: { raceId: string }) {
    this.server.emit('betting:closed', payload);
  }

  emitOddsUpdated(payload: { raceId: string; odds: OddsSnapshot }) {
    this.server.emit('odds:updated', payload);
  }

  emitRaceCountdown(payload: { raceId: string; count: number }) {
    this.server.emit('race:countdown', payload);
  }

  emitRaceStarted(payload: { raceId: string }) {
    this.server.emit('race:started', payload);
  }

  emitRaceUpdate(payload: { raceId: string; horses: RaceHorseSnapshot[] }) {
    this.server.emit('race:update', payload);
  }

  /**
   * Generic event envelope for anything that happens mid-race. This phase
   * only emits `horse.finished`, but the shape is intentionally open so
   * phase 4 powerup events (bomb/turbo/shield) can reuse this same channel
   * without a payload/schema change.
   */
  emitRaceEvent(payload: { raceId: string; type: string; [key: string]: unknown }) {
    this.server.emit('race:event', payload);
  }

  emitRaceFinished(payload: { raceId: string; standings: HorseFinish[] }) {
    this.server.emit('race:finished', payload);
  }

  /** Target-emit to every socket registered for one player only — never a broadcast. */
  emitCoinsUpdatedTo(
    socketIds: string[],
    payload: { coins: number; reason: 'race_payout' | 'bailout' },
  ) {
    for (const socketId of socketIds) {
      this.server.to(socketId).emit('coins:updated', payload);
    }
  }

  /** Targeted: the 2 power-ups granted to one player at RACING start. */
  emitPowerUpsReceivedTo(
    socketIds: string[],
    payload: { raceId: string; powerUps: { id: string; type: string }[] },
  ) {
    for (const socketId of socketIds) {
      this.server.to(socketId).emit('powerup:received', payload);
    }
  }
}
