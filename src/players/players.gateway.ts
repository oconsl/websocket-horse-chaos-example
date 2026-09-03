import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlayersService } from './players.service.js';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class PlayersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly playersService: PlayersService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket) {
    const sessionToken = client.handshake.auth?.sessionToken as string | undefined;

    if (!sessionToken) {
      client.emit('game:error', { message: 'Missing sessionToken' });
      client.disconnect();
      return;
    }

    const player = await this.prisma.player.findUnique({
      where: { sessionToken },
    });

    if (!player) {
      client.emit('game:error', { message: 'Invalid sessionToken' });
      client.disconnect();
      return;
    }

    this.playersService.registerConnection(client.id, {
      playerId: player.id,
      username: player.username,
      coins: player.coins,
    });

    this.server.emit('lobby:update', this.playersService.getLobbySnapshot());
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.playersService.removeConnection(client.id);
    this.server.emit('lobby:update', this.playersService.getLobbySnapshot());
  }
}
