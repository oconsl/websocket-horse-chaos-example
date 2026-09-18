import { Module } from '@nestjs/common';
import { GameService } from './game.service.js';
import { GameGateway } from './game.gateway.js';
import { RaceEngineService } from './race-engine.service.js';
import { AdminRacesController } from './admin-races.controller.js';
import { RacesController } from './races.controller.js';
import { LeaderboardController } from './leaderboard.controller.js';
import { PlayersModule } from '../players/players.module.js';

@Module({
  imports: [PlayersModule],
  controllers: [AdminRacesController, RacesController, LeaderboardController],
  providers: [GameService, GameGateway, RaceEngineService],
})
export class GameModule {}
