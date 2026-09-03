import { Controller, Param, Post } from '@nestjs/common';
import { GameService } from './game.service.js';

/**
 * No auth on admin routes this phase — classroom demo, not gated behind
 * player sessions. Drives the game state machine from a host/instructor page.
 */
@Controller('admin/races')
export class AdminRacesController {
  constructor(private readonly gameService: GameService) {}

  @Post()
  create() {
    return this.gameService.createRace();
  }

  @Post(':id/open-betting')
  openBetting(@Param('id') id: string) {
    return this.gameService.openBetting(id);
  }

  @Post(':id/close-betting')
  closeBetting(@Param('id') id: string) {
    return this.gameService.closeBetting(id);
  }

  @Post(':id/start')
  start(@Param('id') id: string) {
    return this.gameService.startRace(id);
  }
}
