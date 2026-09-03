import { Module } from '@nestjs/common';
import { GameService } from './game.service.js';
import { GameGateway } from './game.gateway.js';
import { AdminRacesController } from './admin-races.controller.js';
import { RacesController } from './races.controller.js';

@Module({
  controllers: [AdminRacesController, RacesController],
  providers: [GameService, GameGateway],
})
export class GameModule {}
