import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ContratosService } from './contratos.service';
import { SignContratoDto } from './dto/sign-contrato.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';

@Controller('contratos')
@UseGuards(JwtAuthGuard)
export class ContratosController {
  constructor(private readonly contratosService: ContratosService) {}

  @Post('generar')
  generar(
    @CurrentUser() user: JwtPayload,
    @Body('solicitudId') solicitudId: string,
  ) {
    return this.contratosService.generar(solicitudId, user.sub);
  }

  @Get('solicitud/:solicitudId')
  findBySolicitud(@Param('solicitudId') solicitudId: string) {
    return this.contratosService.findBySolicitud(solicitudId);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.contratosService.findById(id);
  }

  @Post(':id/firmar')
  firmar(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SignContratoDto,
  ) {
    return this.contratosService.firmar(id, user.sub, dto.firma_base64);
  }
}
