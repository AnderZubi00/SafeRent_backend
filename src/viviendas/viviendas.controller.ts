import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ViviendasService } from './viviendas.service';
import { CreateViviendaDto } from './dto/create-vivienda.dto';
import { CreateBorradorDto } from './dto/create-borrador.dto';
import { UpdateViviendaDto } from './dto/update-vivienda.dto';
import { UpdateFase3Dto } from './dto/update-fase3.dto';
import { UpdateFase4Dto } from './dto/update-fase4.dto';
import { UpdateFase5Dto } from './dto/update-fase5.dto';
import { FilterViviendasDto } from './dto/filter-viviendas.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('viviendas')
export class ViviendasController {
  constructor(private readonly viviendasService: ViviendasService) {}

  @Get()
  findAll(@Query() filtros: FilterViviendasDto) {
    return this.viviendasService.findAll(filtros);
  }

  @Get('mis-viviendas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROPIETARIO')
  findMine(@CurrentUser() user: JwtPayload) {
    return this.viviendasService.findByPropietario(user.sub);
  }

  // ── Borrador / Fases routes (BEFORE :id to avoid param matching) ──

  @Post('borrador')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROPIETARIO')
  createBorrador(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateBorradorDto,
  ) {
    return this.viviendasService.createBorrador(user.sub, dto.titulo);
  }

  @Get('borradores')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROPIETARIO')
  findBorradores(@CurrentUser() user: JwtPayload) {
    return this.viviendasService.findBorradores(user.sub);
  }

  // ── :id routes ─────────────────────────────────────────────────────

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.viviendasService.findById(id, true);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROPIETARIO')
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateViviendaDto,
  ) {
    return this.viviendasService.create(user.sub, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROPIETARIO')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateViviendaDto,
  ) {
    return this.viviendasService.update(id, user.sub, dto);
  }

  @Patch(':id/fase/:num')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROPIETARIO')
  updateFase(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('num', ParseIntPipe) num: number,
    @Body() dto: UpdateFase3Dto | UpdateFase4Dto | UpdateFase5Dto,
  ) {
    return this.viviendasService.updateFase(id, num, dto, user.sub);
  }

  @Post(':id/publicar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROPIETARIO')
  publicar(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.viviendasService.publicar(id, user.sub);
  }

  @Post(':id/nota-simple/upload-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROPIETARIO')
  getNotaSimpleUploadUrl(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.viviendasService.getNotaSimpleUploadUrl(id, user.sub);
  }

  @Delete(':id/borrador')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROPIETARIO')
  deleteBorrador(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.viviendasService.deleteBorrador(id, user.sub);
  }

  @Post(':id/fotos/upload-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROPIETARIO')
  getPhotoUploadUrl(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('filename') filename: string,
  ) {
    return this.viviendasService.generatePhotoUploadUrl(id, user.sub, filename);
  }
}
