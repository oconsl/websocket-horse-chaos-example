import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { GameService } from './game.service.js';
import { AdminGuard } from '../auth/admin.guard.js';

/** Drives the game state machine from a host/instructor page. Admin-only. */
@Controller('admin/races')
@UseGuards(AdminGuard)
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
