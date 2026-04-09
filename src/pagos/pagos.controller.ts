import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  ParseFloatPipe,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { PagosService } from './pagos.service';
import { CreatePagoDto } from './dto/create-pago.dto';
import { CreatePagoIntentDto } from './dto/create-pago-intent.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

@Controller('pagos')
@UseGuards(JwtAuthGuard)
export class PagosController {
  constructor(private readonly pagosService: PagosService) {}

  @Post('stripe-connect/mock')
  @UseGuards(RolesGuard)
  @Roles('PROPIETARIO')
  mockStripeConnect(@CurrentUser() user: JwtPayload) {
    return this.pagosService.mockStripeConnect(user);
  }

  @Post('stripe-connect/onboard')
  @UseGuards(RolesGuard)
  @Roles('PROPIETARIO')
  onboardStripeConnect(@CurrentUser() user: JwtPayload) {
    return this.pagosService.createStripeConnectAccount(user);
  }

  @Post('stripe-connect/onboard-refresh')
  @UseGuards(RolesGuard)
  @Roles('PROPIETARIO')
  refreshOnboardingLink(@CurrentUser() user: JwtPayload) {
    return this.pagosService.refreshOnboardingLink(user);
  }

  @Get('stripe-connect/status')
  @UseGuards(RolesGuard)
  @Roles('PROPIETARIO')
  getStripeStatus(@CurrentUser() user: JwtPayload) {
    return this.pagosService.getStripeConnectStatus(user.sub);
  }

  @Post('webhook/connect')
  @SkipThrottle()
  @UseGuards()
  handleConnectWebhook(@Req() req: RawBodyRequest<Request>) {
    const rawBody = req.rawBody!;
    const signature = req.headers['stripe-signature'] as string;
    return this.pagosService.handleConnectWebhook(rawBody, signature);
  }

  @Get('fee-preview')
  @UseGuards(RolesGuard)
  @Roles('INQUILINO')
  getFeePreview(@Query('amount', ParseFloatPipe) amount: number) {
    return this.pagosService.calculateFeePreview(amount);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('INQUILINO')
  registrar(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePagoDto,
  ) {
    return this.pagosService.registrar(user.sub, dto);
  }

  @Post('create-intent')
  @Throttle({ strict: { ttl: 60000, limit: 5 } })
  @UseGuards(RolesGuard)
  @Roles('INQUILINO')
  createIntent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePagoIntentDto,
  ) {
    return this.pagosService.createIntent(user, dto);
  }

  @Post('webhook')
  @SkipThrottle()
  @UseGuards()
  handleWebhook(@Req() req: RawBodyRequest<Request>) {
    const rawBody = req.rawBody!;
    const signature = req.headers['stripe-signature'] as string;
    return this.pagosService.handleWebhook(rawBody, signature);
  }

  @Get('inquilino')
  @UseGuards(RolesGuard)
  @Roles('INQUILINO')
  findByInquilino(@CurrentUser() user: JwtPayload, @Query() pagination: PaginationDto) {
    return this.pagosService.findByInquilino(user.sub, pagination);
  }

  @Get('propietario')
  @UseGuards(RolesGuard)
  @Roles('PROPIETARIO')
  findByPropietario(@CurrentUser() user: JwtPayload, @Query() pagination: PaginationDto) {
    return this.pagosService.findByPropietario(user.sub, pagination);
  }
}
