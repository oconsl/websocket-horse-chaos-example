import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { OddsSnapshot } from './odds.js';
import type { RaceHorseSnapshot, HorseFinish } from './race-engine.service.js';

/**
 * Focused gateway for race/betting broadcasts. Shares the same underlying
 * Socket.IO server instance as PlayersGateway (no explicit namespace/port),
 * so events land on the same clients that receive `lobby:update`.
 */
@WebSocketGateway({
  cors: { origin: '*' },
})
export class GameGateway {
  @WebSocketServer()
  server!: Server;

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
}
