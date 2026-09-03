import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { GameService } from './game.service.js';
import { PlaceBetDto } from './dto/place-bet.dto.js';
import { PlayerAuthGuard } from '../auth/player-auth.guard.js';
import { CurrentPlayer } from '../auth/current-player.decorator.js';
import type { Player } from '@prisma/client';

@Controller('races')
export class RacesController {
  constructor(private readonly gameService: GameService) {}

  @Get('current')
  async getCurrent() {
    const race = await this.gameService.getCurrentRace();
    if (!race) {
      throw new NotFoundException('No race in progress');
    }
    return race;
  }

  @Post(':id/bets')
  @UseGuards(PlayerAuthGuard)
  placeBet(
    @Param('id') id: string,
    @Body() dto: PlaceBetDto,
    @CurrentPlayer() player: Player,
  ) {
    return this.gameService.placeBet(id, player, dto);
  }
}
