import {
  Body,
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ExchangeTokenDto } from './dto/exchange-token.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Intercambia un token de Supabase Auth por un JWT propio del backend.
   * Este es el único endpoint de autenticación — login y registro pasan por Supabase.
   */
  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  exchange(@Body() dto: ExchangeTokenDto) {
    return this.authService.exchange(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }
}
