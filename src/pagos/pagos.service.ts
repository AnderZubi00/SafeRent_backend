import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreatePagoDto } from './dto/create-pago.dto';

@Injectable()
export class PagosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async registrar(inquilinoId: string, dto: CreatePagoDto) {
    const pago = await this.prisma.pago.create({
      data: {
        solicitud_id: dto.solicitud_id,
        inquilino_id: inquilinoId,
        vivienda_id: dto.vivienda_id,
        concepto: dto.concepto,
        importe: dto.importe,
        estado: 'COMPLETADO',
        metodo: dto.metodo ?? 'tarjeta',
      },
    });

    // Fetch data for email
    const solicitud = await this.prisma.solicitud.findUnique({
      where: { id: dto.solicitud_id },
      include: {
        propietario: {
          select: { email: true, nombre_completo: true },
        },
        inquilino: {
          select: { nombre_completo: true },
        },
        vivienda: {
          select: { titulo: true },
        },
      },
    });

    if (solicitud) {
      await this.email.sendPagoRecibido({
        propietarioEmail: solicitud.propietario.email,
        propietarioNombre: solicitud.propietario.nombre_completo,
        inquilinoNombre: solicitud.inquilino.nombre_completo,
        viviendaTitulo: solicitud.vivienda.titulo,
        importe: `${dto.importe.toLocaleString('es-ES')} EUR`,
      });
    }

    return pago;
  }

  async findByInquilino(inquilinoId: string) {
    return this.prisma.pago.findMany({
      where: { inquilino_id: inquilinoId },
      include: {
        vivienda: { select: { titulo: true, ciudad: true } },
      },
      orderBy: { fecha_pago: 'desc' },
    });
  }

  async findByPropietario(propietarioId: string) {
    return this.prisma.pago.findMany({
      where: {
        vivienda: { propietario_id: propietarioId },
      },
      include: {
        vivienda: { select: { titulo: true, ciudad: true, propietario_id: true } },
        solicitud: {
          select: {
            inquilino_id: true,
            motivo: true,
            fecha_entrada: true,
            fecha_salida: true,
            inquilino: {
              select: { nombre_completo: true, email: true },
            },
          },
        },
      },
      orderBy: { fecha_pago: 'desc' },
    });
  }
}
