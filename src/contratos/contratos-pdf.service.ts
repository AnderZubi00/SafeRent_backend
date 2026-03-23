import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface DatosContrato {
  vivienda: {
    titulo: string;
    direccion: string;
    ciudad: string;
    numRegistro: string;
    precioMes: number;
    fianza: number;
  };
  propietario: { nombre: string; email: string; dni: string };
  inquilino: { nombre: string; email: string; dni: string };
  fechaInicio: string;
  fechaFin: string;
  motivo: string;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

@Injectable()
export class ContratosPdfService {
  async generarPDF(datos: DatosContrato): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const page = doc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();
    const margin = 50;
    let y = height - margin;

    const dark = rgb(0.12, 0.16, 0.21);
    const accent = rgb(0.31, 0.27, 0.89);
    const gray = rgb(0.39, 0.45, 0.53);

    // Header
    page.drawText('CONTRATO DE ARRENDAMIENTO', {
      x: margin, y, font: fontBold, size: 18, color: dark,
    });
    y -= 22;
    page.drawText('DE VIVIENDA TEMPORAL', {
      x: margin, y, font: fontBold, size: 18, color: dark,
    });
    y -= 18;
    page.drawText(
      `Generado por SafeRent · ${formatDate(new Date().toISOString())}`,
      { x: margin, y, font, size: 9, color: gray },
    );
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 2,
      color: accent,
    });
    y -= 30;

    function sectionTitle(text: string) {
      page.drawText(text, {
        x: margin, y, font: fontBold, size: 12, color: accent,
      });
      y -= 6;
      page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 0.5,
        color: rgb(0.89, 0.91, 0.94),
      });
      y -= 16;
    }

    function row(label: string, value: string) {
      page.drawText(label, {
        x: margin, y, font: fontBold, size: 9, color: gray,
      });
      page.drawText(value, {
        x: margin + 140, y, font, size: 9, color: dark,
      });
      y -= 16;
    }

    function paragraph(text: string) {
      const words = text.split(' ');
      let line = '';
      const maxW = width - margin * 2;
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(test, 9.5) > maxW) {
          page.drawText(line, { x: margin, y, font, size: 9.5, color: dark });
          y -= 14;
          line = w;
        } else {
          line = test;
        }
      }
      if (line) {
        page.drawText(line, { x: margin, y, font, size: 9.5, color: dark });
        y -= 14;
      }
      y -= 6;
    }

    // Partes intervinientes
    sectionTitle('PARTES INTERVINIENTES');

    page.drawText('ARRENDADOR (Propietario)', {
      x: margin, y, font: fontBold, size: 10, color: dark,
    });
    y -= 16;
    row('Nombre completo:', datos.propietario.nombre);
    row('DNI/NIE:', datos.propietario.dni);
    row('Email:', datos.propietario.email);
    y -= 6;

    page.drawText('ARRENDATARIO (Inquilino)', {
      x: margin, y, font: fontBold, size: 10, color: dark,
    });
    y -= 16;
    row('Nombre completo:', datos.inquilino.nombre);
    row('DNI/NIE:', datos.inquilino.dni);
    row('Email:', datos.inquilino.email);
    y -= 10;

    // Objeto del contrato
    sectionTitle('OBJETO DEL CONTRATO');
    row('Vivienda:', datos.vivienda.titulo);
    row(
      'Direccion:',
      `${datos.vivienda.direccion}, ${datos.vivienda.ciudad}`,
    );
    row('N. Registro:', datos.vivienda.numRegistro);
    row('Motivo estancia:', datos.motivo);
    y -= 10;

    // Condiciones economicas
    const meses = Math.max(
      1,
      Math.round(
        (new Date(datos.fechaFin).getTime() -
          new Date(datos.fechaInicio).getTime()) /
          (1000 * 60 * 60 * 24 * 30),
      ),
    );

    sectionTitle('CONDICIONES ECONOMICAS');
    row('Renta mensual:', `${datos.vivienda.precioMes.toLocaleString('es-ES')} EUR`);
    row('Fianza:', `${datos.vivienda.fianza.toLocaleString('es-ES')} EUR`);
    row(
      'Duracion:',
      `${meses} meses (del ${formatDate(datos.fechaInicio)} al ${formatDate(datos.fechaFin)})`,
    );
    y -= 10;

    // Clausulas
    sectionTitle('CLAUSULAS');

    page.drawText('PRIMERA. Objeto', {
      x: margin, y, font: fontBold, size: 9.5, color: dark,
    });
    y -= 14;
    paragraph(
      `El arrendador cede al arrendatario el uso temporal de la vivienda descrita, destinada exclusivamente a satisfacer la necesidad de alojamiento temporal del arrendatario por motivo de: ${datos.motivo.toLowerCase()}.`,
    );

    page.drawText('SEGUNDA. Duracion', {
      x: margin, y, font: fontBold, size: 9.5, color: dark,
    });
    y -= 14;
    paragraph(
      `El presente contrato tendra una duracion de ${meses} meses, desde el ${formatDate(datos.fechaInicio)} hasta el ${formatDate(datos.fechaFin)}, sin posibilidad de prorroga tacita al tratarse de un arrendamiento de uso distinto de vivienda habitual.`,
    );

    page.drawText('TERCERA. Renta y fianza', {
      x: margin, y, font: fontBold, size: 9.5, color: dark,
    });
    y -= 14;
    paragraph(
      `La renta mensual se fija en ${datos.vivienda.precioMes.toLocaleString('es-ES')} EUR, pagaderos dentro de los primeros cinco dias de cada mes. Se constituye una fianza de ${datos.vivienda.fianza.toLocaleString('es-ES')} EUR que sera devuelta al finalizar el contrato, previa verificacion del estado de la vivienda.`,
    );

    page.drawText('CUARTA. Pago seguro', {
      x: margin, y, font: fontBold, size: 9.5, color: dark,
    });
    y -= 14;
    paragraph(
      'Los pagos se realizan a traves de la plataforma SafeRent mediante sistema de escrow. El importe queda retenido hasta la confirmacion de entrada del inquilino en la vivienda.',
    );

    // Firmas
    y -= 20;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: rgb(0.89, 0.91, 0.94),
    });
    y -= 50;

    page.drawLine({
      start: { x: margin, y },
      end: { x: margin + 180, y },
      thickness: 0.5,
      color: rgb(0.58, 0.64, 0.72),
    });
    y -= 12;
    page.drawText('EL ARRENDADOR (Propietario)', {
      x: margin, y, font, size: 8, color: gray,
    });
    y -= 12;
    page.drawText(datos.propietario.nombre, {
      x: margin, y, font, size: 8, color: dark,
    });

    const rightX = width - margin - 180;
    y += 24;
    page.drawLine({
      start: { x: rightX, y: y + 12 },
      end: { x: rightX + 180, y: y + 12 },
      thickness: 0.5,
      color: rgb(0.58, 0.64, 0.72),
    });
    page.drawText('EL ARRENDATARIO (Inquilino)', {
      x: rightX, y, font, size: 8, color: gray,
    });
    y -= 12;
    page.drawText(datos.inquilino.nombre, {
      x: rightX, y, font, size: 8, color: dark,
    });

    // Footer
    page.drawText(
      'Documento generado digitalmente por SafeRent · Plataforma de alquiler temporal seguro',
      { x: margin, y: 30, font, size: 7, color: rgb(0.58, 0.64, 0.72) },
    );

    const bytes = await doc.save();
    return Buffer.from(bytes);
  }
}
