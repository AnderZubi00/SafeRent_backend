import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';

type ImageContent = OpenAI.Chat.Completions.ChatCompletionContentPartImage;

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
  }

  // --- Session management ---

  async createOrGetSession(userId: string) {
    // Check for existing pending session
    const existente = await this.prisma.kycSesion.findFirst({
      where: {
        usuario_id: userId,
        estado: 'PENDIENTE',
        expira_en: { gt: new Date() },
      },
      select: { id: true, token: true, expira_en: true },
      orderBy: { creado_en: 'desc' },
    });

    if (existente) {
      return existente;
    }

    // Create new session (30 min expiry)
    return this.prisma.kycSesion.create({
      data: {
        usuario_id: userId,
        estado: 'PENDIENTE',
        expira_en: new Date(Date.now() + 30 * 60 * 1000),
      },
      select: { id: true, token: true, expira_en: true },
    });
  }

  async getEstado(userId: string) {
    const sesion = await this.prisma.kycSesion.findFirst({
      where: { usuario_id: userId, estado: 'COMPLETADO' },
      select: { safe_score: true, nfc_verificado: true, estado: true },
      orderBy: { actualizado_en: 'desc' },
    });

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: { verificado_kyc: true },
    });

    return {
      verificado_kyc: usuario?.verificado_kyc ?? false,
      ultima_sesion: sesion,
    };
  }

  // --- Analysis modes ---

  async analyzeMobile(imageBase64: string) {
    const imageContent: ImageContent = {
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: 'high' },
    };

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      store: false,
      messages: [
        {
          role: 'system',
          content:
            'Eres un sistema OCR especializado en leer la zona MRZ (Machine Readable Zone) de documentos de identidad españoles. Tu tarea principal es transcribir con precisión absoluta los caracteres de la zona MRZ. Responde SOLO con JSON válido, sin markdown ni texto adicional.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analiza esta imagen de DNI español. Localiza la zona MRZ (las 3 líneas de caracteres en la franja inferior del reverso del documento, con letras y números en tipografía OCR-B).

PASO 1 — Lee la MRZ carácter por carácter. El DNI español tiene formato TD1:
- Línea 1 (30 chars): empieza con "IDESP" luego el número de soporte
- Línea 2 (30 chars): YYMMDD + dígito + M/F/< + YYMMDD + dígito + ESP + ...
  - Posiciones 1-6: fecha nacimiento (YYMMDD)
  - Posición 7: dígito verificador nacimiento
  - Posición 8: sexo (M/F/<)
  - Posiciones 9-14: fecha expiración (YYMMDD)
  - Posición 15: dígito verificador expiración
- Línea 3 (30 chars): apellidos<<nombre

PASO 2 — Extrae exactamente los campos pedidos.

Responde con este JSON exacto:
{
  "recomendacion": "APROBAR" | "RECHAZAR" | "REVISAR_MANUAL",
  "safe_score": 0-75,
  "mrz_linea1": "transcripción exacta línea 1 MRZ (30 chars)",
  "mrz_linea2": "transcripción exacta línea 2 MRZ (30 chars)",
  "datos_extraidos": {
    "nombre": "nombre(s) de pila del titular",
    "apellidos": "apellidos completos",
    "numero_documento": "número DNI/NIE (ej: 49577656Y)",
    "numero_soporte": "número de soporte de línea 1 MRZ, posiciones 6-14",
    "fecha_nacimiento": "6 dígitos YYMMDD de posiciones 1-6 línea 2 MRZ",
    "fecha_expiracion": "6 dígitos YYMMDD de posiciones 9-14 línea 2 MRZ"
  },
  "tipo_documento": "DNI" | "NIE" | "Pasaporte" | "Desconocido"
}

Criterios safe_score (máximo 75):
- 55-75: MRZ legible, datos claros, documento auténtico → APROBAR
- 30-54: MRZ parcialmente legible → REVISAR_MANUAL
- 0-29: No es documento válido → RECHAZAR

Si no puedes leer algún campo, déjalo como cadena vacía.`,
            },
            imageContent,
          ],
        },
      ],
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new BadRequestException('No se recibió respuesta del modelo');
    }

    return this.parseMobileResponse(content);
  }

  async analyzeMrz(imageBase64: string, soporteHint?: string) {
    const imageContent: ImageContent = {
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: 'high' },
    };

    const soporteContext = soporteHint
      ? `\n\nCONTEXTO CRÍTICO: El número de soporte del documento es "${soporteHint}". La línea 1 de la MRZ DEBE contener "${soporteHint}" en posiciones 6-14.`
      : '';

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      store: false,
      messages: [
        {
          role: 'system',
          content:
            'Eres un OCR especializado en leer la zona MRZ de documentos de identidad españoles (formato TD1, 3 líneas). Tu única tarea es transcribir con precisión EXACTA los caracteres que ves. NUNCA inventes datos. Responde SOLO con JSON válido.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Localiza la zona MRZ en el reverso del documento.

El DNI español tiene formato TD1:
- Línea 1 (30 chars): "IDESP" + número_soporte (posiciones 6-14)
- Línea 2 (30 chars): YYMMDD(DOB) + cd + M/F + YYMMDD(expiry) + cd + ESP...

Responde con este JSON exacto:
{
  "ok": true/false,
  "numero_soporte": "alfanumérico 9 chars de línea 1 posiciones 6-14",
  "fecha_nacimiento": "6 dígitos YYMMDD de posiciones 1-6 línea 2",
  "fecha_expiracion": "6 dígitos YYMMDD de posiciones 9-14 línea 2",
  "mrz_linea1": "transcripción completa línea 1",
  "mrz_linea2": "transcripción completa línea 2"
}

Si la MRZ no es visible → ok:false, todos los campos vacíos.${soporteContext}`,
            },
            imageContent,
          ],
        },
      ],
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content ?? '';
    let parsed: Record<string, unknown> = {};
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // ignore
    }

    const soporte = (parsed.numero_soporte as string) ?? '';
    const soporteValid = !soporteHint || soporte === soporteHint;

    const dob = (parsed.fecha_nacimiento as string) ?? '';
    const expiry = (parsed.fecha_expiracion as string) ?? '';
    const line2 = (parsed.mrz_linea2 as string) ?? '';

    const dobCd = line2.length >= 7 ? parseInt(line2[6]) : -1;
    const expiryCd = line2.length >= 15 ? parseInt(line2[14]) : -1;
    const dobValid = dob.length === 6 && !isNaN(dobCd) && mrzCheckDigit(dob) === dobCd;
    const expiryValid = expiry.length === 6 && !isNaN(expiryCd) && mrzCheckDigit(expiry) === expiryCd;

    const allValid = soporteValid && !!soporte && dobValid && expiryValid;

    return {
      ok: allValid,
      numero_soporte: soporte,
      fecha_nacimiento: allValid ? dob : '',
      fecha_expiracion: allValid ? expiry : '',
      mrz_linea1: (parsed.mrz_linea1 as string) ?? '',
      mrz_linea2: line2,
      cd_debug: { dobCd, expiryCd, dobValid, expiryValid, soporteValid },
    };
  }

  async analyzeCompleto(frenteBase64: string, reversoBase64: string) {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      store: false,
      messages: [
        {
          role: 'system',
          content:
            'Eres un sistema OCR especializado en documentos de identidad españoles. Recibirás el ANVERSO y el REVERSO del mismo DNI. Extrae datos del anverso y transcribe la MRZ del reverso. NUNCA inventes datos. Responde SOLO con JSON válido, sin markdown.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analiza AMBAS imágenes del DNI español:
- IMAGEN 1: anverso (cara con foto y datos visuales)
- IMAGEN 2: reverso (cara con zona MRZ)

Del ANVERSO extrae: nombre, apellidos, número de DNI, numero_soporte.
Del REVERSO transcribe mrz_linea1 y mrz_linea2 exactamente (30 chars cada una).

Responde con este JSON:
{
  "recomendacion": "APROBAR" | "RECHAZAR" | "REVISAR_MANUAL",
  "safe_score": número entre 0 y 75,
  "datos_extraidos": {
    "nombre": "nombre(s)",
    "apellidos": "apellidos",
    "numero_documento": "DNI/NIE (ej: 49577656Y)",
    "numero_soporte": "9 chars de línea 1 MRZ posiciones 6-14",
    "fecha_nacimiento": "YYMMDD de posiciones 0-5 línea 2 MRZ",
    "fecha_expiracion": "YYMMDD de posiciones 8-13 línea 2 MRZ"
  },
  "mrz_linea1": "30 chars línea 1 MRZ",
  "mrz_linea2": "30 chars línea 2 MRZ",
  "tipo_documento": "DNI" | "NIE" | "Pasaporte" | "Desconocido"
}`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${frenteBase64}`, detail: 'high' },
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${reversoBase64}`, detail: 'high' },
            },
          ],
        },
      ],
      max_tokens: 1200,
    });

    const content = response.choices[0]?.message?.content ?? '';
    let parsed: Record<string, unknown> = {};
    let parseOk = false;
    try {
      let raw = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) raw = raw.substring(start, end + 1);
      parsed = JSON.parse(raw);
      parseOk = true;
    } catch {
      this.logger.error('[KYC analyzeCompleto] JSON parse failed');
    }

    const datos = (parsed.datos_extraidos ?? {}) as Record<string, string>;
    const line2 = ((parsed.mrz_linea2 as string) ?? '').replace(/[^A-Z0-9<]/g, '').slice(0, 30);
    const line1 = ((parsed.mrz_linea1 as string) ?? '').replace(/[^A-Z0-9<]/g, '').slice(0, 30);

    const dobFromLine = line2.length >= 7 ? line2.substring(0, 6) : '';
    const expFromLine = line2.length >= 15 ? line2.substring(8, 14) : '';
    const dobCd = line2.length >= 7 ? parseInt(line2[6]) : -1;
    const expiryCd = line2.length >= 15 ? parseInt(line2[14]) : -1;
    const dobValid = dobFromLine.length === 6 && !isNaN(dobCd) && mrzCheckDigit(dobFromLine) === dobCd;
    const expiryValid = expFromLine.length === 6 && !isNaN(expiryCd) && mrzCheckDigit(expFromLine) === expiryCd;

    const dob = dobValid ? dobFromLine : (datos.fecha_nacimiento ?? '');
    const expiry = expiryValid ? expFromLine : (datos.fecha_expiracion ?? '');

    const soporteFromLine1 = line1.length >= 15 ? line1.substring(5, 14) : '';
    const soporteCd = line1.length >= 15 ? parseInt(line1[14]) : -1;
    const soporteValid = soporteFromLine1.length === 9 && !isNaN(soporteCd) &&
      mrzCheckDigit(soporteFromLine1) === soporteCd;

    const soporte = soporteValid ? soporteFromLine1 : (datos.numero_soporte ?? '');
    const numeroDni = datos.numero_documento ?? '';
    const hasDni = !!numeroDni;

    const recomendacion = (() => {
      if (!parseOk && !hasDni) return 'RECHAZAR';
      if (!hasDni) return 'REVISAR_MANUAL';
      if (dobValid && expiryValid) return 'APROBAR';
      return 'REVISAR_MANUAL';
    })();

    const safe_score = (() => {
      const raw = (parsed.safe_score as number) ?? 0;
      if (recomendacion === 'RECHAZAR') return Math.min(raw, 29);
      if (recomendacion === 'REVISAR_MANUAL') return Math.min(raw || 40, 54);
      return Math.min(raw || 60, 75);
    })();

    return {
      recomendacion,
      safe_score,
      mrz_debug: {
        linea1: line1, linea2: line2,
        dobValid, expiryValid, dobCd, expiryCd, dob, expiry,
        soporteValid,
      },
      datos_extraidos: {
        nombre: datos.nombre ?? '',
        apellidos: datos.apellidos ?? '',
        numero_documento: numeroDni,
        numero_soporte: soporte,
        fecha_nacimiento: dob,
        fecha_expiracion: expiry,
      },
      tipo_documento: (parsed.tipo_documento as string) ?? 'Desconocido',
      cd_ok: dobValid && expiryValid,
    };
  }

  // --- Helpers ---

  private parseMobileResponse(content: string) {
    let parsed: Record<string, unknown> = {};
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        recomendacion: 'RECHAZAR',
        safe_score: 0,
        datos_extraidos: {
          nombre: '', apellidos: '', numero_documento: '',
          numero_soporte: '', fecha_nacimiento: '', fecha_expiracion: '',
        },
        tipo_documento: 'Desconocido',
        error: 'No se pudo interpretar la respuesta del análisis',
      };
    }

    const datos = (parsed.datos_extraidos ?? {}) as Record<string, string>;

    return {
      recomendacion: (parsed.recomendacion as string) ?? 'RECHAZAR',
      safe_score: Math.min((parsed.safe_score as number) ?? 0, 75),
      mrz_debug: {
        linea1: (parsed.mrz_linea1 as string) ?? '',
        linea2: (parsed.mrz_linea2 as string) ?? '',
      },
      datos_extraidos: {
        nombre: datos.nombre ?? '',
        apellidos: datos.apellidos ?? '',
        numero_documento: datos.numero_documento ?? '',
        numero_soporte: datos.numero_soporte ?? '',
        fecha_nacimiento: datos.fecha_nacimiento ?? '',
        fecha_expiracion: datos.fecha_expiracion ?? '',
      },
      tipo_documento: (parsed.tipo_documento as string) ?? 'Desconocido',
    };
  }

  // --- Mobile session management (token-based auth) ---

  async validateSessionByToken(token: string) {
    const sesion = await this.prisma.kycSesion.findFirst({
      where: { token },
    });

    if (!sesion) {
      throw new NotFoundException('Sesión no encontrada');
    }

    if (new Date(sesion.expira_en) <= new Date()) {
      return { valid: false, reason: 'expired', estado: 'EXPIRADO' };
    }

    if (sesion.estado === 'COMPLETADO') {
      return {
        valid: true,
        estado: sesion.estado,
        safe_score: sesion.safe_score,
        nfc_verificado: sesion.nfc_verificado,
      };
    }

    if (sesion.estado !== 'PENDIENTE') {
      return { valid: false, reason: 'already_processed', estado: sesion.estado };
    }

    // Mark as scanning
    await this.prisma.kycSesion.update({
      where: { id: sesion.id },
      data: { estado: 'ESCANEANDO' },
    });

    return { valid: true, estado: 'ESCANEANDO', sesionId: sesion.id };
  }

  async updateSessionByToken(
    token: string,
    update: {
      estado: string;
      safe_score?: number;
      nfc_verificado?: boolean;
      nombre_extraido?: string;
      apellidos_extraidos?: string;
      dni_extraido?: string;
      tipo_documento?: string;
      datos_raw?: unknown;
    },
  ) {
    const sesion = await this.prisma.kycSesion.findFirst({
      where: { token },
    });

    if (!sesion) {
      throw new NotFoundException('Sesión no encontrada');
    }

    return this.prisma.kycSesion.update({
      where: { id: sesion.id },
      data: {
        estado: update.estado,
        safe_score: update.safe_score,
        nfc_verificado: update.nfc_verificado,
        nombre_extraido: update.nombre_extraido,
        apellidos_extraidos: update.apellidos_extraidos,
        dni_extraido: update.dni_extraido,
        tipo_documento: update.tipo_documento,
        datos_raw: update.datos_raw as any,
      },
    });
  }
}

/** ICAO 9303 check digit algorithm */
function mrzCheckDigit(str: string): number {
  const weights = [7, 3, 1];
  const val = (c: string): number => {
    if (c >= '0' && c <= '9') return parseInt(c);
    if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55;
    return 0; // '<' = 0
  };
  return str.split('').reduce((sum, c, i) => sum + val(c) * weights[i % 3], 0) % 10;
}
