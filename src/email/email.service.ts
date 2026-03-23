import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

const FROM_EMAIL = 'SafeRent <onboarding@resend.dev>';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('RESEND_API_KEY');
    if (key) {
      this.resend = new Resend(key);
    }
  }

  private async send(to: string, subject: string, html: string) {
    if (!this.resend) {
      this.logger.log(`[Email mock] To: ${to} | Subject: ${subject}`);
      return;
    }

    try {
      await this.resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    } catch (err) {
      this.logger.error('Error enviando email:', err);
    }
  }

  async sendSolicitudRecibida(params: {
    propietarioEmail: string;
    propietarioNombre: string;
    inquilinoNombre: string;
    viviendaTitulo: string;
  }) {
    await this.send(
      params.propietarioEmail,
      `Nueva solicitud de ${params.inquilinoNombre} para ${params.viviendaTitulo}`,
      `
      <div style="font-family: system-ui, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #1e293b;">Nueva solicitud de reserva</h2>
        <p style="color: #475569;">Hola ${params.propietarioNombre},</p>
        <p style="color: #475569;"><strong>${params.inquilinoNombre}</strong> ha solicitado reservar tu vivienda <strong>${params.viviendaTitulo}</strong>.</p>
        <p style="color: #475569;">Accede a tu panel de propietario para revisar la solicitud y aceptarla o rechazarla.</p>
        <div style="margin-top: 24px; padding: 16px; background: #f1f5f9; border-radius: 12px;">
          <p style="margin: 0; font-size: 14px; color: #64748b;">Revisa los documentos del inquilino y toma una decisión.</p>
        </div>
      </div>
      `,
    );
  }

  async sendSolicitudAceptada(params: {
    inquilinoEmail: string;
    inquilinoNombre: string;
    viviendaTitulo: string;
  }) {
    await this.send(
      params.inquilinoEmail,
      `Tu solicitud para ${params.viviendaTitulo} ha sido aceptada`,
      `
      <div style="font-family: system-ui, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #1e293b;">¡Solicitud aceptada!</h2>
        <p style="color: #475569;">Hola ${params.inquilinoNombre},</p>
        <p style="color: #475569;">El propietario ha aceptado tu solicitud para <strong>${params.viviendaTitulo}</strong>.</p>
        <p style="color: #475569;">El contrato se está generando. Una vez que el propietario lo firme, podrás revisarlo y firmarlo tú también.</p>
        <div style="margin-top: 24px; padding: 16px; background: #ecfdf5; border-radius: 12px;">
          <p style="margin: 0; font-size: 14px; color: #065f46;">Te notificaremos cuando el contrato esté listo para tu firma.</p>
        </div>
      </div>
      `,
    );
  }

  async sendSolicitudRechazada(params: {
    inquilinoEmail: string;
    inquilinoNombre: string;
    viviendaTitulo: string;
    motivoRechazo: string;
  }) {
    await this.send(
      params.inquilinoEmail,
      `Tu solicitud para ${params.viviendaTitulo} no ha sido aceptada`,
      `
      <div style="font-family: system-ui, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #1e293b;">Solicitud no aceptada</h2>
        <p style="color: #475569;">Hola ${params.inquilinoNombre},</p>
        <p style="color: #475569;">Lamentablemente, el propietario ha rechazado tu solicitud para <strong>${params.viviendaTitulo}</strong>.</p>
        <div style="margin-top: 16px; padding: 16px; background: #fff1f2; border-radius: 12px;">
          <p style="margin: 0; font-size: 14px; color: #9f1239;"><strong>Motivo:</strong> ${params.motivoRechazo}</p>
        </div>
        <p style="color: #475569; margin-top: 16px;">Puedes seguir buscando otras viviendas disponibles en la plataforma.</p>
      </div>
      `,
    );
  }

  async sendContratoListo(params: {
    inquilinoEmail: string;
    inquilinoNombre: string;
    viviendaTitulo: string;
  }) {
    await this.send(
      params.inquilinoEmail,
      `Contrato listo para firmar - ${params.viviendaTitulo}`,
      `
      <div style="font-family: system-ui, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #1e293b;">Contrato listo para tu firma</h2>
        <p style="color: #475569;">Hola ${params.inquilinoNombre},</p>
        <p style="color: #475569;">El propietario ha firmado el contrato para <strong>${params.viviendaTitulo}</strong>.</p>
        <p style="color: #475569;">Accede a tu proceso de reserva para revisar y firmar el contrato digitalmente.</p>
        <div style="margin-top: 24px; padding: 16px; background: #eef2ff; border-radius: 12px;">
          <p style="margin: 0; font-size: 14px; color: #3730a3;">Una vez firmado, podrás proceder al pago.</p>
        </div>
      </div>
      `,
    );
  }

  async sendPagoRecibido(params: {
    propietarioEmail: string;
    propietarioNombre: string;
    inquilinoNombre: string;
    viviendaTitulo: string;
    importe: string;
  }) {
    await this.send(
      params.propietarioEmail,
      `Pago recibido de ${params.inquilinoNombre} - ${params.viviendaTitulo}`,
      `
      <div style="font-family: system-ui, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #1e293b;">¡Pago confirmado!</h2>
        <p style="color: #475569;">Hola ${params.propietarioNombre},</p>
        <p style="color: #475569;"><strong>${params.inquilinoNombre}</strong> ha completado el pago de <strong>${params.importe}</strong> para <strong>${params.viviendaTitulo}</strong>.</p>
        <p style="color: #475569;">El pago queda retenido en escrow hasta que el inquilino confirme su llegada.</p>
        <div style="margin-top: 24px; padding: 16px; background: #ecfdf5; border-radius: 12px;">
          <p style="margin: 0; font-size: 14px; color: #065f46;">La reserva está confirmada.</p>
        </div>
      </div>
      `,
    );
  }
}
