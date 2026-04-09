import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { KycService } from './kyc.service';
import { EstadoKyc } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { CompletarPropietarioDto } from './dto/completar-propietario.dto';

@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  // --- JWT-authenticated endpoints ---

  @Post('sesion')
  @UseGuards(JwtAuthGuard)
  createSession(@CurrentUser() user: JwtPayload) {
    return this.kycService.createOrGetSession(user.sub);
  }

  @Get('estado')
  @UseGuards(JwtAuthGuard)
  getEstado(@CurrentUser() user: JwtPayload) {
    return this.kycService.getEstado(user.sub);
  }

  @Patch('completar-propietario')
  @UseGuards(JwtAuthGuard)
  completarPropietario(
    @CurrentUser() user: JwtPayload,
    @Body() body: CompletarPropietarioDto,
  ) {
    return this.kycService.completarPropietario(user.sub, body);
  }

  @Post('analizar')
  @Throttle({ kyc: { ttl: 60000, limit: 3 } })
  @UseGuards(JwtAuthGuard)
  async analizar(
    @Body() body: { imagen_base64?: string },
  ) {
    if (!body.imagen_base64) {
      throw new BadRequestException('Se requiere imagen_base64');
    }
    return this.kycService.analyzeMobile(body.imagen_base64);
  }

  @Post('analizar/mrz')
  @Throttle({ kyc: { ttl: 60000, limit: 3 } })
  @UseGuards(JwtAuthGuard)
  async analizarMrz(
    @Body() body: { imagen_base64: string; soporte?: string },
  ) {
    if (!body.imagen_base64) {
      throw new BadRequestException('Se requiere imagen_base64');
    }
    return this.kycService.analyzeMrz(body.imagen_base64, body.soporte);
  }

  @Post('analizar/completo')
  @Throttle({ kyc: { ttl: 60000, limit: 3 } })
  @UseGuards(JwtAuthGuard)
  async analizarCompleto(
    @Body() body: { frente_base64: string; reverso_base64: string },
  ) {
    if (!body.frente_base64 || !body.reverso_base64) {
      throw new BadRequestException('Se requieren frente_base64 y reverso_base64');
    }
    return this.kycService.analyzeCompleto(body.frente_base64, body.reverso_base64);
  }

  // --- Token-authenticated endpoints (mobile KYC via QR) ---

  @Post('mobile/validate')
  async mobileValidate(@Body() body: { token: string }) {
    if (!body.token) {
      throw new BadRequestException('Se requiere token');
    }
    return this.kycService.validateSessionByToken(body.token);
  }

  @Patch('mobile/estado')
  async mobileUpdateEstado(
    @Body()
    body: {
      token: string;
      estado: EstadoKyc;
      safe_score?: number;
      nfc_verificado?: boolean;
      nombre_extraido?: string;
      apellidos_extraidos?: string;
      dni_extraido?: string;
      tipo_documento?: string;
      datos_raw?: unknown;
    },
  ) {
    if (!body.token || !body.estado) {
      throw new BadRequestException('Se requieren token y estado');
    }
    return this.kycService.updateSessionByToken(body.token, body);
  }

  @Post('mobile/analizar-completo')
  @Throttle({ kyc: { ttl: 60000, limit: 3 } })
  async mobileAnalizarCompleto(
    @Body() body: { frente_base64: string; reverso_base64: string },
  ) {
    if (!body.frente_base64 || !body.reverso_base64) {
      throw new BadRequestException('Se requieren frente_base64 y reverso_base64');
    }
    return this.kycService.analyzeCompleto(body.frente_base64, body.reverso_base64);
  }
}
