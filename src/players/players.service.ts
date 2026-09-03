import { Injectable } from '@nestjs/common';

export interface ConnectedPlayer {
  playerId: string;
  username: string;
  coins: number;
}

@Injectable()
export class PlayersService {
  /** socketId -> connected player info (cached, not re-fetched from DB) */
  private readonly connections = new Map<string, ConnectedPlayer>();

  registerConnection(socketId: string, player: ConnectedPlayer): void {
    this.connections.set(socketId, player);
  }

  removeConnection(socketId: string): void {
    this.connections.delete(socketId);
  }

  getConnectedPlayers(): ConnectedPlayer[] {
    return Array.from(this.connections.values());
  }

  getLobbySnapshot() {
    const players = this.getConnectedPlayers();
    return {
      players: players.map(({ playerId, username, coins }) => ({
        playerId,
        username,
        coins,
      })),
      count: players.length,
    };
  }

  /** All socket ids currently registered for a player (multiple tabs/devices possible). */
  getSocketIdsForPlayer(playerId: string): string[] {
    const socketIds: string[] = [];
    for (const [socketId, player] of this.connections) {
      if (player.playerId === playerId) {
        socketIds.push(socketId);
      }
    }
    return socketIds;
  }

  /** Resolves which player owns a given socket connection, or null if unregistered. */
  getPlayerIdForSocket(socketId: string): string | null {
    return this.connections.get(socketId)?.playerId ?? null;
  }
}
