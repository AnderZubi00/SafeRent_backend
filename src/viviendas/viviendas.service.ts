import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateViviendaDto } from './dto/create-vivienda.dto';
import { UpdateViviendaDto } from './dto/update-vivienda.dto';
import { FilterViviendasDto } from './dto/filter-viviendas.dto';
import { Prisma } from '@prisma/client';

const BUCKET_FOTOS = 'viviendas-fotos';

@Injectable()
export class ViviendasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async create(propietarioId: string, dto: CreateViviendaDto) {
    return this.prisma.vivienda.create({
      data: {
        propietario_id: propietarioId,
        titulo: dto.titulo,
        descripcion: dto.descripcion,
        direccion: dto.direccion,
        barrio: dto.barrio,
        ciudad: dto.ciudad,
        provincia: dto.provincia,
        precio_mes: dto.precio_mes,
        fianza_importe: dto.fianza_importe,
        habitaciones: dto.habitaciones,
        banos: dto.banos,
        m2: dto.m2,
        motivos: dto.motivos,
        num_registro_vivienda: dto.num_registro_vivienda,
        disponible_desde: dto.disponible_desde
          ? new Date(dto.disponible_desde)
          : null,
        estancia_minima: dto.estancia_minima,
        estancia_maxima: dto.estancia_maxima,
        activa: true,
        verificada: false,
        fotos: [],
      },
    });
  }

  async findAll(filtros?: FilterViviendasDto) {
    const where: Prisma.ViviendaWhereInput = { activa: true };

    if (filtros?.provincia && filtros.provincia !== 'todas') {
      where.provincia = { contains: filtros.provincia, mode: 'insensitive' };
    }

    if (filtros?.ciudad && filtros.ciudad !== 'todas') {
      where.ciudad = { contains: filtros.ciudad, mode: 'insensitive' };
    }

    if (filtros?.motivo && filtros.motivo !== 'todos') {
      where.motivos = { has: filtros.motivo };
    }

    if (filtros?.precioMin !== undefined) {
      where.precio_mes = {
        ...(where.precio_mes as Prisma.FloatFilter),
        gte: filtros.precioMin,
      };
    }

    if (filtros?.precioMax !== undefined) {
      where.precio_mes = {
        ...(where.precio_mes as Prisma.FloatFilter),
        lte: filtros.precioMax,
      };
    }

    if (filtros?.habitaciones !== undefined && filtros.habitaciones > 0) {
      where.habitaciones = { gte: filtros.habitaciones };
    }

    return this.prisma.vivienda.findMany({
      where,
      orderBy: { fecha_creacion: 'desc' },
    });
  }

  async findById(id: string, includeOwner = false) {
    const vivienda = await this.prisma.vivienda.findUnique({
      where: { id },
      include: includeOwner
        ? {
            propietario: {
              select: {
                nombre_completo: true,
                verificado_kyc: true,
                fecha_creacion: true,
              },
            },
          }
        : undefined,
    });

    if (!vivienda) {
      throw new NotFoundException('Vivienda no encontrada');
    }

    return vivienda;
  }

  async findByPropietario(propietarioId: string) {
    return this.prisma.vivienda.findMany({
      where: { propietario_id: propietarioId },
      orderBy: { fecha_creacion: 'desc' },
    });
  }

  async update(id: string, propietarioId: string, dto: UpdateViviendaDto) {
    const vivienda = await this.findById(id);

    if (vivienda.propietario_id !== propietarioId) {
      throw new ForbiddenException('No eres el propietario de esta vivienda');
    }

    const data: Prisma.ViviendaUpdateInput = {};

    if (dto.titulo !== undefined) data.titulo = dto.titulo;
    if (dto.descripcion !== undefined) data.descripcion = dto.descripcion;
    if (dto.direccion !== undefined) data.direccion = dto.direccion;
    if (dto.barrio !== undefined) data.barrio = dto.barrio;
    if (dto.ciudad !== undefined) data.ciudad = dto.ciudad;
    if (dto.provincia !== undefined) data.provincia = dto.provincia;
    if (dto.precio_mes !== undefined) data.precio_mes = dto.precio_mes;
    if (dto.fianza_importe !== undefined)
      data.fianza_importe = dto.fianza_importe;
    if (dto.habitaciones !== undefined) data.habitaciones = dto.habitaciones;
    if (dto.banos !== undefined) data.banos = dto.banos;
    if (dto.m2 !== undefined) data.m2 = dto.m2;
    if (dto.motivos !== undefined) data.motivos = dto.motivos;
    if (dto.num_registro_vivienda !== undefined)
      data.num_registro_vivienda = dto.num_registro_vivienda;
    if (dto.disponible_desde !== undefined)
      data.disponible_desde = dto.disponible_desde
        ? new Date(dto.disponible_desde)
        : null;
    if (dto.estancia_minima !== undefined)
      data.estancia_minima = dto.estancia_minima;
    if (dto.estancia_maxima !== undefined)
      data.estancia_maxima = dto.estancia_maxima;
    if (dto.activa !== undefined) data.activa = dto.activa;
    if (dto.fotos !== undefined) data.fotos = dto.fotos;

    return this.prisma.vivienda.update({ where: { id }, data });
  }

  async generatePhotoUploadUrl(
    viviendaId: string,
    propietarioId: string,
    filename: string,
  ) {
    const vivienda = await this.findById(viviendaId);

    if (vivienda.propietario_id !== propietarioId) {
      throw new ForbiddenException('No eres el propietario de esta vivienda');
    }

    const ext = filename.split('.').pop() ?? 'jpg';
    const path = `${propietarioId}/${viviendaId}/${Date.now()}.${ext}`;

    const { signedUrl } = await this.storage.generateSignedUploadUrl(
      BUCKET_FOTOS,
      path,
    );

    return {
      signedUrl,
      publicUrl: this.storage.getPublicUrl(BUCKET_FOTOS, path),
    };
  }
}
