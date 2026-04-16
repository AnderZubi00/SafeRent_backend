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
import { CreateBloqueoDto } from './dto/create-bloqueo.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginate, PaginatedResponse } from '../common/interfaces/paginated-response.interface';
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

  async findAll(filtros?: FilterViviendasDto): Promise<PaginatedResponse<any>> {
    const where: Prisma.ViviendaWhereInput = { activa: true, es_borrador: false };
    const { fechaEntrada, fechaSalida } = filtros ?? {};

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

    // Filtro de disponibilidad por fechas
    Object.assign(
      where,
      fechaEntrada && fechaSalida
        ? {
            NOT: [
              {
                solicitudes: {
                  some: {
                    estado: 'ACEPTADA' as const,
                    fecha_entrada: { lt: new Date(fechaSalida) },
                    fecha_salida: { gt: new Date(fechaEntrada) },
                  },
                },
              },
              {
                bloqueos: {
                  some: {
                    fecha_inicio: { lt: new Date(fechaSalida) },
                    fecha_fin:    { gt: new Date(fechaEntrada) },
                  },
                },
              },
            ],
            OR: [
              { disponible_desde: null },
              { disponible_desde: { lte: new Date(fechaEntrada) } },
            ],
          }
        : fechaEntrada
          ? {
              OR: [
                { disponible_desde: null },
                { disponible_desde: { lte: new Date(fechaEntrada) } },
              ],
            }
          : {},
    );

    const page = filtros?.page ?? 1;
    const limit = filtros?.limit ?? 20;
    const skip = (page - 1) * limit;

    const orderBy: Prisma.ViviendaOrderByWithRelationInput =
      filtros?.ordenar === 'precio_asc'
        ? { precio_mes: 'asc' }
        : filtros?.ordenar === 'precio_desc'
          ? { precio_mes: 'desc' }
          : { fecha_creacion: 'desc' };

    const [data, total] = await Promise.all([
      this.prisma.vivienda.findMany({
        where,
        orderBy,
        take: limit,
        skip,
      }),
      this.prisma.vivienda.count({ where }),
    ]);

    return paginate(data, total, page, limit);
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

  async findByPropietario(propietarioId: string, pagination?: PaginationDto): Promise<PaginatedResponse<any>> {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = { propietario_id: propietarioId, es_borrador: false };

    const [data, total] = await Promise.all([
      this.prisma.vivienda.findMany({
        where,
        orderBy: { fecha_creacion: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.vivienda.count({ where }),
    ]);

    return paginate(data, total, page, limit);
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

  async findBorradores(userId: string, pagination?: PaginationDto): Promise<PaginatedResponse<any>> {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = { propietario_id: userId, es_borrador: true };

    const [data, total] = await Promise.all([
      this.prisma.vivienda.findMany({
        where,
        orderBy: { fecha_creacion: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.vivienda.count({ where }),
    ]);

    return paginate(data, total, page, limit);
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
    if (!vivienda.precio_mes || vivienda.precio_mes.lte(0))
      camposFaltantes.push('precio_mes');
    if (!vivienda.fianza_importe || vivienda.fianza_importe.lte(0))
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
        fase_actual: 5,
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

  async getDisponibilidad(id: string) {
    const vivienda = await this.prisma.vivienda.findUnique({
      where: { id },
      select: {
        disponible_desde: true,
        estancia_minima: true,
        estancia_maxima: true,
        solicitudes: {
          where: { estado: 'ACEPTADA' },
          select: {
            fecha_entrada: true,
            fecha_salida: true,
          },
          orderBy: { fecha_entrada: 'asc' },
        },
        bloqueos: {
          select: { id: true, fecha_inicio: true, fecha_fin: true, motivo: true },
          orderBy: { fecha_inicio: 'asc' },
        },
      },
    });

    if (!vivienda) throw new NotFoundException('Vivienda no encontrada');

    return {
      disponible_desde: vivienda.disponible_desde,
      estancia_minima: vivienda.estancia_minima,
      estancia_maxima: vivienda.estancia_maxima,
      ocupaciones: vivienda.solicitudes.map((s) => ({
        fecha_entrada: s.fecha_entrada,
        fecha_salida: s.fecha_salida,
      })),
      bloqueos: vivienda.bloqueos,
    };
  }

  async crearBloqueo(viviendaId: string, propietarioId: string, dto: CreateBloqueoDto) {
    const vivienda = await this.findById(viviendaId);
    if (vivienda.propietario_id !== propietarioId) {
      throw new ForbiddenException('No eres el propietario de esta vivienda');
    }
    const inicio = new Date(dto.fecha_inicio);
    const fin    = new Date(dto.fecha_fin);
    if (inicio >= fin) {
      throw new BadRequestException('fecha_inicio debe ser anterior a fecha_fin');
    }
    return this.prisma.bloqueoFecha.create({
      data: { vivienda_id: viviendaId, fecha_inicio: inicio, fecha_fin: fin, motivo: dto.motivo },
    });
  }

  async eliminarBloqueo(bloqueoId: string, propietarioId: string) {
    const bloqueo = await this.prisma.bloqueoFecha.findUnique({
      where: { id: bloqueoId },
      include: { vivienda: { select: { propietario_id: true } } },
    });
    if (!bloqueo) throw new NotFoundException('Bloqueo no encontrado');
    if (bloqueo.vivienda.propietario_id !== propietarioId) {
      throw new ForbiddenException('No eres el propietario de esta vivienda');
    }
    return this.prisma.bloqueoFecha.delete({ where: { id: bloqueoId } });
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
