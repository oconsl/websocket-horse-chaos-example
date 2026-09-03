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
      players: players.map(({ username, coins }) => ({ username, coins })),
      count: players.length,
    };
  }
}
