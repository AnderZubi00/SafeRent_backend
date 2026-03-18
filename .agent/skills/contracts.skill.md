# Skill: Contratos Digitales & PDF

> Cargado cuando: ContratoDigital, Signaturit, firma electrónica, PDF, Puppeteer.

---

## Modelo de Dominio

`ContratoDigital` tiene una relación `1:1` con `Reserva`:

```
Reserva (CONFIRMADO)
  └─ ContratoDigital
       ├─ id_firma_externa     → ID del sobre en Signaturit
       ├─ pdf_final_url        → path en Supabase Storage (bucket: contratos-pdf)
       ├─ firmado_propietario  → boolean
       ├─ firmado_inquilino    → boolean
       └─ fecha_firma_completa → se registra cuando ambos firmaron
```

El contrato se genera **después** de que la Reserva pasa a `CONFIRMADO`.
El propietario firma primero, luego el inquilino. Cuando ambos firman → Reserva → `COMPLETADO`.

---

## Flujo Completo

```
1. Reserva → CONFIRMADO
2. ContractsService.generarContrato(reservaId)
   a. Obtener datos: Reserva, Vivienda, Usuario (inquilino + propietario)
   b. Generar PDF con Puppeteer (HTML template → PDF)
   c. Subir PDF a Supabase Storage (bucket: contratos-pdf)
   d. Crear registro ContratoDigital con pdf_final_url
   e. Crear sobre en Signaturit con los firmantes
   f. Guardar id_firma_externa en ContratoDigital
3. Signaturit envía email a propietario → firma
4. Webhook Signaturit → firmado_propietario = true
5. Signaturit envía email a inquilino → firma
6. Webhook Signaturit → firmado_inquilino = true, fecha_firma_completa = now()
7. Descargar PDF firmado de Signaturit → reemplazar en Storage
8. Reserva → COMPLETADO (trigger para liberar pago)
```

---

## Módulo NestJS: ContractsModule

```
src/contracts/
  contracts.module.ts
  contracts.controller.ts
  contracts.service.ts       # Orquestación del flujo
  contracts.dto.ts
  pdf.service.ts             # Generación de PDF con Puppeteer
  signaturit.service.ts      # Wrapper de la API de Signaturit
  contracts.service.spec.ts
  pdf.service.spec.ts
```

---

## Endpoints

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/contracts/generar/:reservaId` | `ADMINISTRADOR` | Genera y envía contrato |
| `GET` | `/contracts/:reservaId` | `INQUILINO`, `PROPIETARIO`, `ADMINISTRADOR` | Estado del contrato |
| `GET` | `/contracts/:reservaId/pdf` | `INQUILINO`, `PROPIETARIO`, `ADMINISTRADOR` | Descargar PDF (signed URL) |
| `POST` | `/contracts/webhook/signaturit` | Sin auth | Webhook de Signaturit |

---

## Generación de PDF con Puppeteer

```typescript
// pdf.service.ts
async generarPdfContrato(datos: DatosContrato): Promise<Buffer> {
  const html = this.renderTemplate('contrato-alquiler', datos);
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format: 'A4',
    margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' },
    printBackground: true,
  });
  await browser.close();
  return Buffer.from(pdf);
}
```

### Template HTML mínimo requerido (`contrato-alquiler`)

El contrato debe incluir:
- Datos del propietario (nombre, DNI/NIE)
- Datos del inquilino (nombre, DNI/NIE)
- Dirección y descripción de la vivienda
- Precio mensual, fianza, fechas de inicio y fin
- Motivo de temporalidad (del `DocumentoTemporal`)
- Cláusulas legales (arrendamiento de temporada, art. 3.2 LAU)
- Espacio para firma electrónica (Signaturit lo gestiona)
- Número de registro de vivienda (`Vivienda.num_registro_vivienda`)

---

## Integración con Signaturit

```typescript
// signaturit.service.ts
const signaturit = new SignaturitClient(this.configService.get('SIGNATURIT_API_KEY'), true); // true = producción

async crearSobre(pdfBuffer: Buffer, firmantes: Firmante[]): Promise<string> {
  const response = await signaturit.createSignature(
    [{ name: 'contrato.pdf', content: pdfBuffer.toString('base64') }],
    firmantes.map(f => ({
      name: f.nombre,
      email: f.email,
      type: 'signature',
    })),
    { subject: 'Firma de contrato SafeRent', body: '...' },
  );
  return response.id; // id_firma_externa
}
```

### Webhook de Signaturit

```typescript
@Post('webhook/signaturit')
@HttpCode(200)
async handleSignaturitWebhook(
  @Headers('x-signaturit-token') token: string,
  @Body() body: SignaturitWebhookDto,
) {
  this.contractsService.verifySignaturitToken(token);
  await this.contractsService.procesarEventoFirma(body);
}
```

Eventos relevantes:
- `signature:completed` → actualizar `firmado_propietario` o `firmado_inquilino`
- `signature:declined` → gestionar rechazo (Reserva puede volver a PENDIENTE)
- `document:completed` → todos firmaron, descargar PDF final

---

## Almacenamiento en Supabase Storage

```
Bucket: contratos-pdf (privado)
Path: reservas/{reservaId}/contrato_{version}.pdf

Versiones:
  - contrato_borrador.pdf  → generado por Puppeteer, antes de firmar
  - contrato_firmado.pdf   → descargado de Signaturit tras firma completa
```

Siempre generar signed URLs para descarga (TTL máx. 300 s para contratos).

---

## Guardrails Específicos

- El PDF generado por Puppeteer no debe guardarse en disco — usar `Buffer` en memoria.
- Nunca exponer el PDF directamente — siempre signed URL con TTL corto.
- Verificar el token de Signaturit antes de procesar cualquier webhook.
- Si `firmado_propietario` y `firmado_inquilino` son ambos `true`, verificar que
  `fecha_firma_completa` fue registrada — si no, corregirlo en el mismo webhook handler.
- La transición Reserva → `COMPLETADO` solo puede ocurrir desde el webhook de Signaturit,
  no desde un endpoint REST directo (evitar manipulación).
- Registrar en Engram cualquier cambio en el flujo de firma o en las cláusulas del contrato.
