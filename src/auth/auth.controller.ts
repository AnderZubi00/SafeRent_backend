import {
  Body,
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { ExchangeTokenDto } from './dto/exchange-token.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

const COOKIE_NAME = 'saferent_jwt';
const COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 8; // 8 días

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('exchange')
  @Throttle({ strict: { ttl: 60000, limit: 50 } })
  @HttpCode(HttpStatus.OK)
  async exchange(
    @Body() dto: ExchangeTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.exchange(dto);
    const isProd = process.env.NODE_ENV === 'production';

    res.cookie(COOKIE_NAME, result.access_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_MS,
      path: '/',
    });

    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }
}
