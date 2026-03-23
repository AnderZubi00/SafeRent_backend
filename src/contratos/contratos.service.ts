import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { EmailService } from '../email/email.service';
import { ContratosPdfService } from './contratos-pdf.service';

const BUCKET_PDF = 'contratos-pdf';

@Injectable()
export class ContratosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly email: EmailService,
    private readonly pdfService: ContratosPdfService,
  ) {}

  async generar(solicitudId: string, userId: string) {
    // Fetch solicitud with all related data
    const solicitud = await this.prisma.solicitud.findUnique({
      where: { id: solicitudId },
      include: {
        vivienda: true,
        inquilino: {
          select: { nombre_completo: true, email: true, dni_nie: true },
        },
        propietario: {
          select: { id: true, nombre_completo: true, email: true, dni_nie: true },
        },
        contrato: true,
      },
    });

    if (!solicitud) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    if (solicitud.propietario.id !== userId) {
      throw new ForbiddenException('No eres el propietario de esta solicitud');
    }

    if (solicitud.contrato) {
      throw new BadRequestException('Ya existe un contrato para esta solicitud');
    }

    // Generate PDF
    const pdfBuffer = await this.pdfService.generarPDF({
      vivienda: {
        titulo: solicitud.vivienda.titulo,
        direccion: solicitud.vivienda.direccion,
        ciudad: solicitud.vivienda.ciudad,
        numRegistro: solicitud.vivienda.num_registro_vivienda,
        precioMes: solicitud.vivienda.precio_mes,
        fianza: solicitud.vivienda.fianza_importe,
      },
      propietario: {
        nombre: solicitud.propietario.nombre_completo,
        email: solicitud.propietario.email,
        dni: solicitud.propietario.dni_nie ?? 'No proporcionado',
      },
      inquilino: {
        nombre: solicitud.inquilino.nombre_completo,
        email: solicitud.inquilino.email,
        dni: solicitud.inquilino.dni_nie ?? 'No proporcionado',
      },
      fechaInicio: solicitud.fecha_entrada.toISOString(),
      fechaFin: solicitud.fecha_salida.toISOString(),
      motivo: solicitud.motivo,
    });

    // Upload to Storage
    const pdfPath = `${solicitudId}/contrato-${Date.now()}.pdf`;
    const pdfUrl = await this.storage.uploadFile(
      BUCKET_PDF,
      pdfPath,
      pdfBuffer,
      'application/pdf',
    );

    // Create contrato record
    const contrato = await this.prisma.contratoDigital.create({
      data: {
        solicitud_id: solicitudId,
        pdf_borrador_url: pdfUrl,
        firmado_propietario: false,
        firmado_inquilino: false,
      },
    });

    return { contrato, pdfUrl };
  }

  async findBySolicitud(solicitudId: string) {
    const contrato = await this.prisma.contratoDigital.findUnique({
      where: { solicitud_id: solicitudId },
    });

    if (!contrato) {
      throw new NotFoundException('Contrato no encontrado para esta solicitud');
    }

    return contrato;
  }

  async findById(id: string) {
    const contrato = await this.prisma.contratoDigital.findUnique({
      where: { id },
    });

    if (!contrato) {
      throw new NotFoundException('Contrato no encontrado');
    }

    return contrato;
  }

  async firmar(contratoId: string, userId: string, firmaBase64: string) {
    const contrato = await this.findById(contratoId);

    // Determine role by checking the solicitud
    const solicitud = await this.prisma.solicitud.findUnique({
      where: { id: contrato.solicitud_id },
      include: {
        inquilino: {
          select: { id: true, nombre_completo: true, email: true },
        },
        propietario: {
          select: { id: true, nombre_completo: true, email: true },
        },
        vivienda: { select: { titulo: true } },
      },
    });

    if (!solicitud) {
      throw new NotFoundException('Solicitud asociada no encontrada');
    }

    const isPropietario = solicitud.propietario.id === userId;
    const isInquilino = solicitud.inquilino.id === userId;

    if (!isPropietario && !isInquilino) {
      throw new ForbiddenException('No eres parte de esta solicitud');
    }

    const updates: Record<string, unknown> = {};

    if (isPropietario) {
      if (contrato.firmado_propietario) {
        throw new BadRequestException('El propietario ya ha firmado');
      }
      updates.firmado_propietario = true;
      updates.firma_propietario_img = firmaBase64;
    } else {
      if (contrato.firmado_inquilino) {
        throw new BadRequestException('El inquilino ya ha firmado');
      }
      updates.firmado_inquilino = true;
      updates.firma_inquilino_img = firmaBase64;
    }

    // Check if both parties have now signed
    const bothSigned =
      (isPropietario && contrato.firmado_inquilino) ||
      (isInquilino && contrato.firmado_propietario);

    if (bothSigned) {
      updates.fecha_firma_completa = new Date();
    }

    const updated = await this.prisma.contratoDigital.update({
      where: { id: contratoId },
      data: updates,
    });

    // Send email notification
    if (isPropietario && !bothSigned) {
      // Propietario signed, notify inquilino
      await this.email.sendContratoListo({
        inquilinoEmail: solicitud.inquilino.email,
        inquilinoNombre: solicitud.inquilino.nombre_completo,
        viviendaTitulo: solicitud.vivienda.titulo,
      });
    }

    return updated;
  }
}
