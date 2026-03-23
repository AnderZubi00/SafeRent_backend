import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { KycService } from './kyc.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';

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

  @Post('analizar')
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
      estado: string;
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
  async mobileAnalizarCompleto(
    @Body() body: { frente_base64: string; reverso_base64: string },
  ) {
    if (!body.frente_base64 || !body.reverso_base64) {
      throw new BadRequestException('Se requieren frente_base64 y reverso_base64');
    }
    return this.kycService.analyzeCompleto(body.frente_base64, body.reverso_base64);
  }
}
