import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PagosService } from './pagos.service';
import { CreatePagoDto } from './dto/create-pago.dto';
import { CreatePagoIntentDto } from './dto/create-pago-intent.dto';
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
  @UseGuards(RolesGuard)
  @Roles('INQUILINO')
  createIntent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePagoIntentDto,
  ) {
    return this.pagosService.createIntent(user, dto);
  }

  @Post('webhook')
  @UseGuards()
  handleWebhook(@Req() req: RawBodyRequest<Request>) {
    const rawBody = req.rawBody!;
    const signature = req.headers['stripe-signature'] as string;
    return this.pagosService.handleWebhook(rawBody, signature);
  }

  @Get('inquilino')
  @UseGuards(RolesGuard)
  @Roles('INQUILINO')
  findByInquilino(@CurrentUser() user: JwtPayload) {
    return this.pagosService.findByInquilino(user.sub);
  }

  @Get('propietario')
  @UseGuards(RolesGuard)
  @Roles('PROPIETARIO')
  findByPropietario(@CurrentUser() user: JwtPayload) {
    return this.pagosService.findByPropietario(user.sub);
  }
}
