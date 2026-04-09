import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateViviendaDto } from './dto/create-vivienda.dto';
import { UpdateViviendaDto } from './dto/update-vivienda.dto';
import { FilterViviendasDto } from './dto/filter-viviendas.dto';
import { Prisma } from '@prisma/client';

const BUCKET_FOTOS = 'viviendas-fotos';
const BUCKET_NOTA_SIMPLE = 'documentos-solicitud';

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
    const where: Prisma.ViviendaWhereInput = { activa: true, es_borrador: false };

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

    if (filtros?.soloVerificadas === true) {
      where.verificada = true;
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
      where: { propietario_id: propietarioId, es_borrador: false },
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

  // ── Borrador / Fases ──────────────────────────────────────────────

  async createBorrador(userId: string, titulo: string) {
    return this.prisma.vivienda.create({
      data: {
        titulo,
        propietario_id: userId,
        es_borrador: true,
        activa: false,
        fase_actual: 1,
        fotos: [],
      },
    });
  }

  async updateFase(
    id: string,
    faseNum: number,
    data: Record<string, any>,
    userId: string,
  ) {
    const vivienda = await this.findById(id);

    if (vivienda.propietario_id !== userId) {
      throw new ForbiddenException('No eres el propietario de esta vivienda');
    }

    if (!vivienda.es_borrador) {
      // Allow fase 5 (verification) on published but unverified viviendas
      if (faseNum === 5 && !vivienda.verificada) {
        // Only allow nota_simple_url update in this case
        const allowed = { nota_simple_url: data.nota_simple_url };
        return this.prisma.vivienda.update({
          where: { id },
          data: allowed,
        });
      }
      throw new BadRequestException(
        'No se pueden actualizar fases en una vivienda publicada',
      );
    }

    const updateData: Prisma.ViviendaUpdateInput = {
      ...data,
      fase_actual: Math.max(vivienda.fase_actual, faseNum),
    };

    if (data.disponible_desde !== undefined) {
      updateData.disponible_desde = data.disponible_desde
        ? new Date(data.disponible_desde)
        : null;
    }

    return this.prisma.vivienda.update({
      where: { id },
      data: updateData,
    });
  }

  async findBorradores(userId: string) {
    return this.prisma.vivienda.findMany({
      where: { propietario_id: userId, es_borrador: true },
      orderBy: { fecha_creacion: 'desc' },
    });
  }

  async publicar(id: string, userId: string) {
    const vivienda = await this.findById(id);

    if (vivienda.propietario_id !== userId) {
      throw new ForbiddenException('No eres el propietario de esta vivienda');
    }

    if (!vivienda.es_borrador) {
      throw new BadRequestException('Esta vivienda ya está publicada');
    }

    // ── Stripe Connect check ──
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: { stripe_account_id: true, stripe_onboarding_complete: true },
    });

    if (!usuario?.stripe_account_id || !usuario?.stripe_onboarding_complete) {
      throw new BadRequestException({
        message: 'Debes conectar tu cuenta de Stripe antes de publicar',
        code: 'STRIPE_NOT_CONNECTED',
      });
    }

    const camposFaltantes: string[] = [];

    if (!vivienda.titulo || vivienda.titulo.trim() === '')
      camposFaltantes.push('titulo');
    if (!vivienda.direccion || vivienda.direccion.trim() === '')
      camposFaltantes.push('direccion');
    if (!vivienda.ciudad || vivienda.ciudad.trim() === '')
      camposFaltantes.push('ciudad');
    if (!vivienda.precio_mes || vivienda.precio_mes <= 0)
      camposFaltantes.push('precio_mes');
    if (!vivienda.fianza_importe || vivienda.fianza_importe <= 0)
      camposFaltantes.push('fianza_importe');
    if (
      !vivienda.num_registro_vivienda ||
      vivienda.num_registro_vivienda.trim() === ''
    )
      camposFaltantes.push('num_registro_vivienda');
    if (!vivienda.habitaciones || vivienda.habitaciones <= 0)
      camposFaltantes.push('habitaciones');
    if (!vivienda.banos || vivienda.banos <= 0)
      camposFaltantes.push('banos');
    if (!vivienda.m2 || vivienda.m2 <= 0) camposFaltantes.push('m2');
    if (!vivienda.motivos || vivienda.motivos.length === 0)
      camposFaltantes.push('motivos');

    if (camposFaltantes.length > 0) {
      throw new BadRequestException({ camposFaltantes });
    }

    return this.prisma.vivienda.update({
      where: { id },
      data: {
        es_borrador: false,
        activa: true,
        fase_actual: 4,
        verificada: false,
      },
    });
  }

  async completarVerificacion(id: string, userId: string) {
    const vivienda = await this.findById(id);

    if (vivienda.propietario_id !== userId) {
      throw new ForbiddenException('No eres el propietario de esta vivienda');
    }

    if (vivienda.es_borrador) {
      throw new BadRequestException('Publicá la vivienda antes de verificarla');
    }

    if (!vivienda.nota_simple_url) {
      throw new BadRequestException('Debés subir la nota simple para verificar la vivienda');
    }

    return this.prisma.vivienda.update({
      where: { id },
      data: { verificada: true, fase_actual: 5 },
    });
  }

  async deleteBorrador(id: string, userId: string) {
    const vivienda = await this.findById(id);

    if (vivienda.propietario_id !== userId) {
      throw new ForbiddenException('No eres el propietario de esta vivienda');
    }

    if (!vivienda.es_borrador) {
      throw new BadRequestException(
        'Solo se pueden eliminar borradores',
      );
    }

    return this.prisma.vivienda.delete({ where: { id } });
  }

  async getNotaSimpleUploadUrl(id: string, userId: string) {
    const vivienda = await this.findById(id);

    if (vivienda.propietario_id !== userId) {
      throw new ForbiddenException('No eres el propietario de esta vivienda');
    }

    const path = `${userId}/${id}/nota-simple-${Date.now()}.pdf`;

    const { signedUrl } = await this.storage.generateSignedUploadUrl(
      BUCKET_NOTA_SIMPLE,
      path,
    );

    return {
      signedUrl,
      publicUrl: this.storage.getPublicUrl(BUCKET_NOTA_SIMPLE, path),
    };
  }
}
