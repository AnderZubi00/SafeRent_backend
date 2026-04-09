import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { StripeService } from './stripe.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { CreatePagoDto } from './dto/create-pago.dto';
import { CreatePagoIntentDto } from './dto/create-pago-intent.dto';
import {
  getCommissionRates,
  calculatePaymentBreakdown,
} from './commission.config';
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
    private readonly config: ConfigService,
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
    const vivienda = await this.prisma.vivienda.findUnique({
      where: { id: dto.vivienda_id },
      include: {
        propietario: {
          select: {
            stripe_account_id: true,
            stripe_onboarding_complete: true,
          },
        },
      },
    });
    if (!vivienda) throw new NotFoundException('Vivienda no encontrada');

    if (
      !vivienda.propietario.stripe_account_id ||
      !vivienda.propietario.stripe_onboarding_complete
    ) {
      throw new BadRequestException(
        'El propietario no tiene cuenta de pagos configurada',
      );
    }

    const rates = getCommissionRates(this.config);
    const breakdown = calculatePaymentBreakdown(dto.importe, rates);
    const fianza = dto.fianza_importe ?? 0;

    // totalCharge = renta + 5% guest fee + fianza (sin comisión)
    const totalConFianza = breakdown.totalCharge + fianza;
    // propietario recibe renta - 5% host fee + fianza íntegra
    const propietarioNetConFianza = breakdown.propietarioNet + fianza;

    const pago = await this.prisma.pago.create({
      data: {
        solicitud_id: dto.solicitud_id,
        inquilino_id: user.sub,
        vivienda_id: dto.vivienda_id,
        concepto: dto.concepto,
        importe: totalConFianza,
        comision_plataforma: breakdown.platformTotal,
        comision_host: breakdown.hostFee,
        comision_guest: breakdown.guestFee,
        importe_propietario: propietarioNetConFianza,
        estado: 'PENDIENTE',
        metodo: 'tarjeta',
      },
    });

    const { clientSecret, paymentIntentId } =
      await this.stripe.createConnectPaymentIntent({
        amount: totalConFianza,
        applicationFeeAmount: breakdown.applicationFeeAmount,
        destinationAccountId: vivienda.propietario.stripe_account_id,
        metadata: {
          pagoId: pago.id,
          solicitudId: dto.solicitud_id,
          inquilinoId: user.sub,
        },
      });

    await this.prisma.pago.update({
      where: { id: pago.id },
      data: { stripe_payment_intent_id: paymentIntentId },
    });

    return {
      clientSecret,
      pagoId: pago.id,
      breakdown: {
        ...breakdown,
        fianza,
        totalConFianza,
        propietarioNetConFianza,
      },
    };
  }

  calculateFeePreview(rentAmount: number) {
    const rates = getCommissionRates(this.config);
    const breakdown = calculatePaymentBreakdown(rentAmount, rates);
    return {
      rentAmount,
      guestFeePct: rates.guestPct * 100,
      guestFee: breakdown.guestFee,
      totalCharge: breakdown.totalCharge,
    };
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

  async mockStripeConnect(user: JwtPayload) {
    await this.prisma.usuario.update({
      where: { id: user.sub },
      data: {
        stripe_account_id: `acct_mock_${user.sub.slice(0, 8)}`,
        stripe_onboarding_complete: true,
      },
    });
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    return { url: `${frontendUrl}/propietario?stripe_connected=true` };
  }

  async createStripeConnectAccount(user: JwtPayload) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: user.sub },
      select: { email: true, stripe_account_id: true },
    });

    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    let accountId = usuario.stripe_account_id;

    if (!accountId) {
      accountId = await this.stripe.createExpressAccount(usuario.email, {
        userId: user.sub,
      });
      await this.prisma.usuario.update({
        where: { id: user.sub },
        data: { stripe_account_id: accountId },
      });
    }

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const url = await this.stripe.createAccountLink(
      accountId,
      `${frontendUrl}/propietario?stripe_refresh=true`,
      `${frontendUrl}/propietario?stripe_connected=true`,
    );

    return { url };
  }

  async refreshOnboardingLink(user: JwtPayload) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: user.sub },
      select: { stripe_account_id: true },
    });

    if (!usuario?.stripe_account_id) {
      throw new BadRequestException('No tienes cuenta de Stripe creada');
    }

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const url = await this.stripe.createAccountLink(
      usuario.stripe_account_id,
      `${frontendUrl}/propietario?stripe_refresh=true`,
      `${frontendUrl}/propietario?stripe_connected=true`,
    );

    return { url };
  }

  async getStripeConnectStatus(userId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: { stripe_account_id: true, stripe_onboarding_complete: true },
    });

    if (!usuario?.stripe_account_id) {
      return {
        connected: false,
        chargesEnabled: false,
        onboardingComplete: false,
        accountId: null,
      };
    }

    return {
      connected: true,
      chargesEnabled: usuario.stripe_onboarding_complete,
      onboardingComplete: usuario.stripe_onboarding_complete,
      accountId: usuario.stripe_account_id,
    };
  }

  async handleConnectWebhook(rawBody: Buffer, signature: string) {
    const event = this.stripe.constructConnectWebhookEvent(rawBody, signature);

    if (event.type === 'account.updated') {
      const account = event.data.object as Stripe.Account;

      const usuario = await this.prisma.usuario.findFirst({
        where: { stripe_account_id: account.id },
      });

      if (usuario) {
        const isComplete = !!(
          account.charges_enabled && account.details_submitted
        );
        await this.prisma.usuario.update({
          where: { id: usuario.id },
          data: { stripe_onboarding_complete: isComplete },
        });
        this.logger.log(
          `Stripe account ${account.id} updated: charges_enabled=${account.charges_enabled}, onboarding_complete=${isComplete}`,
        );
      }
    }

    return { received: true };
  }
}
