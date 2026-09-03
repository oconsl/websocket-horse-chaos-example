import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { OddsSnapshot } from './odds.js';

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
}
