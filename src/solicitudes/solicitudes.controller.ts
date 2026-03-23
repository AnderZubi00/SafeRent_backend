import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SolicitudesService } from './solicitudes.service';
import { CreateSolicitudDto } from './dto/create-solicitud.dto';
import { RejectSolicitudDto } from './dto/reject-solicitud.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';

@Controller('solicitudes')
@UseGuards(JwtAuthGuard)
export class SolicitudesController {
  constructor(private readonly solicitudesService: SolicitudesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('INQUILINO')
  create(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: CreateSolicitudDto & {
      documento_identidad_url: string;
      documento_justificativo_url: string;
    },
  ) {
    return this.solicitudesService.create(
      user.sub,
      body,
      body.documento_identidad_url,
      body.documento_justificativo_url,
    );
  }

  @Get('inquilino')
  @UseGuards(RolesGuard)
  @Roles('INQUILINO')
  findByInquilino(@CurrentUser() user: JwtPayload) {
    return this.solicitudesService.findByInquilino(user.sub);
  }

  @Get('propietario')
  @UseGuards(RolesGuard)
  @Roles('PROPIETARIO')
  findByPropietario(@CurrentUser() user: JwtPayload) {
    return this.solicitudesService.findByPropietario(user.sub);
  }

  @Get('pendientes/count')
  @UseGuards(RolesGuard)
  @Roles('PROPIETARIO')
  countPendientes(@CurrentUser() user: JwtPayload) {
    return this.solicitudesService.countPendientes(user.sub);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.solicitudesService.findById(id);
  }

  @Get(':id/estado')
  getEstado(@Param('id') id: string) {
    return this.solicitudesService.getEstado(id);
  }

  @Post(':id/aceptar')
  @UseGuards(RolesGuard)
  @Roles('PROPIETARIO')
  aceptar(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.solicitudesService.aceptar(id, user.sub);
  }

  @Post(':id/rechazar')
  @UseGuards(RolesGuard)
  @Roles('PROPIETARIO')
  rechazar(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RejectSolicitudDto,
  ) {
    return this.solicitudesService.rechazar(id, user.sub, dto.motivo_rechazo);
  }

  @Post(':id/docs/upload-url')
  @UseGuards(RolesGuard)
  @Roles('INQUILINO')
  getDocUploadUrls(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.solicitudesService.generateDocUploadUrls(id, user.sub);
  }
}
