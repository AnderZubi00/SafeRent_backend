import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ViviendasService } from './viviendas.service';
import { CreateViviendaDto } from './dto/create-vivienda.dto';
import { UpdateViviendaDto } from './dto/update-vivienda.dto';
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
