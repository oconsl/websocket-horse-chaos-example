import { Controller, Get } from '@nestjs/common';
import { GameService } from './game.service.js';

/** Public — top players by coins. No auth, matching the rest of the read-only race data. */
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly gameService: GameService) {}

  @Get()
  getLeaderboard() {
    return this.gameService.getLeaderboard();
  }
}
