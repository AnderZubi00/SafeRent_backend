import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { EmailService } from '../email/email.service';
import { ContratosService } from '../contratos/contratos.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { CreateSolicitudDto } from './dto/create-solicitud.dto';

const BUCKET_DOCS = 'documentos-solicitud';

@Injectable()
export class SolicitudesService {
  private readonly logger = new Logger(SolicitudesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly email: EmailService,
    private readonly contratos: ContratosService,
    private readonly notifications: NotificationsGateway,
  ) {}

  async create(
    inquilinoId: string,
    dto: CreateSolicitudDto,
    documentoIdentidadUrl: string,
    documentoJustificativoUrl: string,
  ) {
    // Verificar que la vivienda existe y está activa
    const vivienda = await this.prisma.vivienda.findUnique({
      where: { id: dto.vivienda_id },
      include: {
        propietario: {
          select: { id: true, email: true, nombre_completo: true },
        },
      },
    });

    if (!vivienda || !vivienda.activa) {
      throw new BadRequestException('La vivienda no existe o no está activa');
    }

    const entrada = new Date(dto.fecha_entrada);
    const salida = new Date(dto.fecha_salida);

    if (isNaN(entrada.getTime()) || isNaN(salida.getTime())) {
      throw new BadRequestException('Fechas inválidas');
    }
    if (entrada >= salida) {
      throw new BadRequestException('La fecha de entrada debe ser anterior a la fecha de salida');
    }
    if (entrada < new Date()) {
      throw new BadRequestException('La fecha de entrada debe ser futura');
    }

    const diffMs = salida.getTime() - entrada.getTime();
    const diffMonths = Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30));
    if (vivienda.estancia_minima && diffMonths < vivienda.estancia_minima) {
      throw new BadRequestException(`La estancia mínima es de ${vivienda.estancia_minima} meses`);
    }
    if (vivienda.estancia_maxima && diffMonths > vivienda.estancia_maxima) {
      throw new BadRequestException(`La estancia máxima es de ${vivienda.estancia_maxima} meses`);
    }

    // Verificar datos del inquilino
    const inquilino = await this.prisma.usuario.findUnique({
      where: { id: inquilinoId },
      select: { nombre_completo: true },
    });

    const solicitud = await this.prisma.solicitud.create({
      data: {
        vivienda_id: dto.vivienda_id,
        inquilino_id: inquilinoId,
        propietario_id: dto.propietario_id,
        motivo: dto.motivo,
        motivo_detalle: dto.motivo_detalle,
        documento_identidad_url: documentoIdentidadUrl,
        documento_justificativo_url: documentoJustificativoUrl,
        fecha_entrada: new Date(dto.fecha_entrada),
        fecha_salida: new Date(dto.fecha_salida),
        estado: 'PENDIENTE',
      },
    });

    // Enviar email al propietario automáticamente
    await this.email.sendSolicitudRecibida({
      propietarioEmail: vivienda.propietario.email,
      propietarioNombre: vivienda.propietario.nombre_completo,
      inquilinoNombre: inquilino?.nombre_completo ?? 'Inquilino',
      viviendaTitulo: vivienda.titulo,
    });

    this.notifications.emitToUser(dto.propietario_id, 'solicitud:created', {
      id: solicitud.id,
      vivienda_id: solicitud.vivienda_id,
      inquilinoNombre: inquilino?.nombre_completo ?? 'Inquilino',
    });

    return solicitud;
  }

  async findByInquilino(inquilinoId: string) {
    return this.prisma.solicitud.findMany({
      where: { inquilino_id: inquilinoId },
      include: {
        vivienda: {
          select: {
            id: true,
            titulo: true,
            ciudad: true,
            barrio: true,
            direccion: true,
            precio_mes: true,
            fianza_importe: true,
            fotos: true,
            estancia_minima: true,
            estancia_maxima: true,
            propietario_id: true,
          },
        },
      },
      orderBy: { fecha_creacion: 'desc' },
    });
  }

  async findByPropietario(propietarioId: string) {
    return this.prisma.solicitud.findMany({
      where: { propietario_id: propietarioId },
      include: {
        vivienda: {
          select: {
            id: true,
            titulo: true,
            ciudad: true,
            barrio: true,
            direccion: true,
            precio_mes: true,
            fianza_importe: true,
            fotos: true,
            estancia_minima: true,
            estancia_maxima: true,
            propietario_id: true,
          },
        },
        inquilino: {
          select: {
            id: true,
            nombre_completo: true,
            email: true,
            dni_nie: true,
          },
        },
      },
      orderBy: { fecha_creacion: 'desc' },
    });
  }

  async findById(id: string) {
    const solicitud = await this.prisma.solicitud.findUnique({
      where: { id },
      include: {
        vivienda: {
          select: {
            id: true,
            titulo: true,
            ciudad: true,
            barrio: true,
            direccion: true,
            precio_mes: true,
            fianza_importe: true,
            fotos: true,
            estancia_minima: true,
            estancia_maxima: true,
            propietario_id: true,
            num_registro_vivienda: true,
          },
        },
        inquilino: {
          select: {
            id: true,
            nombre_completo: true,
            email: true,
            dni_nie: true,
          },
        },
        propietario: {
          select: {
            id: true,
            nombre_completo: true,
            email: true,
            dni_nie: true,
          },
        },
      },
    });

    if (!solicitud) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    return solicitud;
  }

  async getEstado(id: string) {
    const solicitud = await this.prisma.solicitud.findUnique({
      where: { id },
      select: {
        estado: true,
        motivo_rechazo: true,
        fecha_entrada: true,
        fecha_salida: true,
        contrato: {
          select: {
            id: true,
            firmado_propietario: true,
            firmado_inquilino: true,
            pdf_borrador_url: true,
          },
        },
      },
    });

    if (!solicitud) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    const pagos_completados = await this.prisma.pago.count({
      where: { solicitud_id: id, estado: 'COMPLETADO' },
    });

    return {
      estado: solicitud.estado,
      motivo_rechazo: solicitud.motivo_rechazo,
      contrato: solicitud.contrato,
      pagos_completados,
      fecha_entrada: solicitud.fecha_entrada,
      fecha_salida: solicitud.fecha_salida,
    };
  }

  async aceptar(id: string, propietarioId: string) {
    const solicitud = await this.findById(id);

    if (solicitud.propietario_id !== propietarioId) {
      throw new ForbiddenException(
        'No eres el propietario de esta vivienda',
      );
    }

    if (solicitud.estado !== 'PENDIENTE') {
      throw new BadRequestException('La solicitud no está pendiente');
    }

    const overlapping = await this.prisma.solicitud.findFirst({
      where: {
        vivienda_id: solicitud.vivienda_id,
        estado: 'ACEPTADA',
        id: { not: id },
        fecha_entrada: { lt: solicitud.fecha_salida },
        fecha_salida: { gt: solicitud.fecha_entrada },
      },
    });
    if (overlapping) {
      throw new BadRequestException('Ya existe una reserva aceptada con fechas solapadas para esta vivienda');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const sol = await tx.solicitud.update({
        where: { id },
        data: { estado: 'ACEPTADA' },
      });

      await this.contratos.generar(id, propietarioId);

      return sol;
    });

    await this.email.sendSolicitudAceptada({
      inquilinoEmail: solicitud.inquilino.email,
      inquilinoNombre: solicitud.inquilino.nombre_completo,
      viviendaTitulo: solicitud.vivienda.titulo,
    });

    this.notifications.emitToUser(solicitud.inquilino.id, 'solicitud:updated', {
      id: updated.id,
      estado: 'ACEPTADA',
    });

    return updated;
  }

  async rechazar(id: string, propietarioId: string, motivoRechazo: string) {
    const solicitud = await this.findById(id);

    if (solicitud.propietario_id !== propietarioId) {
      throw new ForbiddenException(
        'No eres el propietario de esta vivienda',
      );
    }

    if (solicitud.estado !== 'PENDIENTE') {
      throw new BadRequestException('La solicitud no está pendiente');
    }

    const updated = await this.prisma.solicitud.update({
      where: { id },
      data: { estado: 'RECHAZADA', motivo_rechazo: motivoRechazo },
    });

    // Enviar email al inquilino
    await this.email.sendSolicitudRechazada({
      inquilinoEmail: solicitud.inquilino.email,
      inquilinoNombre: solicitud.inquilino.nombre_completo,
      viviendaTitulo: solicitud.vivienda.titulo,
      motivoRechazo,
    });

    this.notifications.emitToUser(solicitud.inquilino.id, 'solicitud:updated', {
      id: updated.id,
      estado: 'RECHAZADA',
    });

    return updated;
  }

  async countPendientes(propietarioId: string): Promise<number> {
    return this.prisma.solicitud.count({
      where: {
        propietario_id: propietarioId,
        estado: 'PENDIENTE',
      },
    });
  }

  async generateDocUploadUrls(
    solicitudId: string,
    inquilinoId: string,
  ) {
    const path = (tipo: string) =>
      `${inquilinoId}/${solicitudId}/${tipo}-${Date.now()}`;

    const [identidad, justificativo] = await Promise.all([
      this.storage.generateSignedUploadUrl(
        BUCKET_DOCS,
        `${path('identidad')}.pdf`,
      ),
      this.storage.generateSignedUploadUrl(
        BUCKET_DOCS,
        `${path('justificativo')}.pdf`,
      ),
    ]);

    return {
      identidad: {
        signedUrl: identidad.signedUrl,
        publicUrl: this.storage.getPublicUrl(BUCKET_DOCS, identidad.path),
      },
      justificativo: {
        signedUrl: justificativo.signedUrl,
        publicUrl: this.storage.getPublicUrl(BUCKET_DOCS, justificativo.path),
      },
    };
  }
}
