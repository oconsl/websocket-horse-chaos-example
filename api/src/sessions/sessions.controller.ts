import { Body, Controller, Post } from '@nestjs/common';
import { SessionsService } from './sessions.service.js';
import { CreateSessionDto } from './dto/create-session.dto.js';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post('register')
  register(@Body() dto: CreateSessionDto) {
    return this.sessionsService.register(dto);
  }

  @Post('login')
  login(@Body() dto: CreateSessionDto) {
    return this.sessionsService.login(dto);
  }
}
