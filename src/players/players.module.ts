import { Module } from '@nestjs/common';
import { PlayersGateway } from './players.gateway.js';
import { PlayersService } from './players.service.js';

@Module({
  providers: [PlayersGateway, PlayersService],
})
export class PlayersModule {}
