import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { StripeService } from './stripe.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { CreatePagoDto } from './dto/create-pago.dto';
import { CreatePagoIntentDto } from './dto/create-pago-intent.dto';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import type Stripe from 'stripe';

@Injectable()
export class PagosService {
  private readonly logger = new Logger(PagosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly stripe: StripeService,
    private readonly notifications: NotificationsGateway,
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

    const solicitud = await this.prisma.solicitud.findUnique({
      where: { id: dto.solicitud_id },
      include: {
        propietario: {
          select: { id: true, email: true, nombre_completo: true },
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
      const pagoNotification = {
        id: pago.id,
        concepto: pago.concepto,
        importe: pago.importe,
        viviendaTitulo: solicitud.vivienda.titulo,
      };
      this.notifications.emitToUser(inquilinoId, 'pago:completed', pagoNotification);
      this.notifications.emitToUser(solicitud.propietario.id, 'pago:completed', pagoNotification);

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

  async createIntent(user: JwtPayload, dto: CreatePagoIntentDto) {
    const pago = await this.prisma.pago.create({
      data: {
        solicitud_id: dto.solicitud_id,
        inquilino_id: user.sub,
        vivienda_id: dto.vivienda_id,
        concepto: dto.concepto,
        importe: dto.importe,
        estado: 'PENDIENTE',
        metodo: 'tarjeta',
      },
    });

    const { clientSecret, paymentIntentId } =
      await this.stripe.createPaymentIntent(dto.importe, {
        pagoId: pago.id,
        solicitudId: dto.solicitud_id,
        inquilinoId: user.sub,
      });

    await this.prisma.pago.update({
      where: { id: pago.id },
      data: { stripe_payment_intent_id: paymentIntentId },
    });

    return { clientSecret, pagoId: pago.id };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const event = this.stripe.constructWebhookEvent(rawBody, signature);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        const pago = await this.prisma.pago.findUnique({
          where: { stripe_payment_intent_id: intent.id },
        });

        if (!pago) {
          this.logger.warn(`No pago found for PaymentIntent ${intent.id}`);
          break;
        }

        await this.prisma.pago.update({
          where: { id: pago.id },
          data: { estado: 'COMPLETADO' },
        });

        const solicitud = await this.prisma.solicitud.findUnique({
          where: { id: pago.solicitud_id },
          include: {
            propietario: {
              select: { id: true, email: true, nombre_completo: true },
            },
            inquilino: {
              select: { id: true, nombre_completo: true },
            },
            vivienda: {
              select: { titulo: true },
            },
          },
        });

        if (solicitud) {
          const pagoNotification = {
            id: pago.id,
            concepto: pago.concepto,
            importe: pago.importe,
            viviendaTitulo: solicitud.vivienda.titulo,
          };
          this.notifications.emitToUser(solicitud.inquilino.id, 'pago:completed', pagoNotification);
          this.notifications.emitToUser(solicitud.propietario.id, 'pago:completed', pagoNotification);

          await this.email.sendPagoRecibido({
            propietarioEmail: solicitud.propietario.email,
            propietarioNombre: solicitud.propietario.nombre_completo,
            inquilinoNombre: solicitud.inquilino.nombre_completo,
            viviendaTitulo: solicitud.vivienda.titulo,
            importe: `${pago.importe.toLocaleString('es-ES')} EUR`,
          });
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        const pago = await this.prisma.pago.findUnique({
          where: { stripe_payment_intent_id: intent.id },
        });

        if (pago) {
          await this.prisma.pago.update({
            where: { id: pago.id },
            data: { estado: 'FALLIDO' },
          });
        } else {
          this.logger.warn(`No pago found for failed PaymentIntent ${intent.id}`);
        }
        break;
      }

      default:
        this.logger.log(`Unhandled Stripe event: ${event.type}`);
    }

    return { received: true };
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
