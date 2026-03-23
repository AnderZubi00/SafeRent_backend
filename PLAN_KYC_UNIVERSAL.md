# Plan: KYC Universal — Soporte para cualquier documento ICAO

## Context

El KYC de SafeRent está hardcodeado a DNI español (TD1). Para un SaaS de alquiler internacional necesita soportar **cualquier documento ICAO 9303**: pasaportes (TD3), tarjetas de identidad de cualquier país (TD1), y formatos legacy (TD2). El NFC/BAC y la DB ya son genéricos — el cuello de botella son los **prompts de GPT-4o** y la **UI del móvil**.

## Formatos MRZ (referencia)

| Formato | Uso | Líneas | Chars/línea | DocNum pos | DOB pos | Expiry pos |
|---------|-----|--------|-------------|------------|---------|------------|
| TD1 | DNI, NIE, IDs nacionales | 3 | 30 | L1: 5-13 | L2: 0-5 (cd:6) | L2: 8-13 (cd:14) |
| TD2 | Algunos IDs EU antiguos | 2 | 36 | L2: 0-8 (cd:9) | L2: 13-18 (cd:19) | L2: 21-26 (cd:27) |
| TD3 | Todos los pasaportes | 2 | 44 | L2: 0-8 (cd:9) | L2: 13-18 (cd:19) | L2: 21-26 (cd:27) |

## Qué NO cambia (ya es genérico)

- `SafeRentMobile/lib/bac.ts` — `buildKmrz()` pad a 9 chars, funciona con TD1/TD2/TD3
- `SafeRentMobile/lib/nfc-passport.ts` — AID ePassport estándar, BAC document-agnostic
- `prisma/schema.prisma` — `tipo_documento String?`, `datos_raw Json?` ya flexibles

---

## Paso 1: `mrz-parser.ts` (nuevo archivo backend)

**Archivo**: `src/kyc/mrz-parser.ts`

Extraer TODA la lógica de parsing MRZ a una utilidad pura:

- `detectFormat(lines: string[]): 'TD1' | 'TD2' | 'TD3'` — por count de líneas y largo
- `parseMrzLines(lines: string[]): MrzParsedFields` — extrae campos en posiciones correctas según formato
- Integra `mrzCheckDigit()` y `correctByCheckDigit()` (mover desde kyc.service.ts)
- Retorna: `{ format, documentNumber, dateOfBirth, dateOfExpiry, nationality, sex, name, cdOk }`

Reemplaza TODOS los `line2.substring(0, 6)` hardcodeados en kyc.service.ts.

## Paso 2: Prompts GPT universales (backend)

**Archivo**: `src/kyc/kyc.service.ts`

### 2a. `analyzeCompleto(frente, reverso?, documentType)`

- Agregar param `documentType: 'id_card' | 'passport'` (default `'id_card'`)
- Si `passport`: `reversoBase64` es opcional (pasaportes = 1 foto de la página de datos)

### 2b. Reescribir system prompt

De: "documentos de identidad **españoles**"
A: "documentos de identidad de **cualquier país** conformes a ICAO 9303"

### 2c. Reescribir user prompt

- Describir los 3 formatos MRZ (TD1, TD2, TD3) con posiciones
- Pedir `formato_mrz: "TD1" | "TD2" | "TD3"` en la respuesta
- Pedir `mrz_lines: string[]` (array de 2 o 3 líneas según formato)
- Expandir `tipo_documento`: `"DNI" | "NIE" | "Pasaporte" | "Tarjeta_ID" | "Desconocido"`
- Agregar campos: `nacionalidad`, `pais_emisor`
- Quitar referencia a "número de soporte" → usar "document number from MRZ"

### 2d. Post-processing

Reemplazar inline `substring()` con `parseMrzLines(response.mrz_lines)`.

### 2e. Aplicar lo mismo a `analyzeMobile` y `analyzeMrz`

## Paso 3: Controller (backend)

**Archivo**: `src/kyc/kyc.controller.ts`

- `POST /kyc/mobile/analizar-completo`: aceptar `document_type` y `reverso_base64` opcional
- `POST /kyc/analizar/completo`: ídem para el endpoint JWT
- Default `document_type = 'id_card'` para backward compatibility

## Paso 4: UI Móvil — Selección de documento

**Archivo**: `SafeRentMobile/app/kyc-movil.tsx`

### 4a. Nuevo estado + pantalla

- Agregar `docType: 'id_card' | 'passport' | null` al state
- Nuevo estado `"select_doc_type"` entre `"validating"` y `"camera_front"`
- Pantalla con 2 cards grandes:
  - **Tarjeta de identidad** (DNI, NIE, ID card) — icono de card
  - **Pasaporte** — icono de booklet

### 4b. Flujo de cámara adaptativo

**`id_card`**: anverso → reverso → analizar → NFC (flujo actual)
**`passport`**: página de datos → analizar → NFC (sin paso de reverso)

- Si `passport`: `capturarYEnviar` va directo a `"analyzing"` (skip `camera_back`)
- Envía `{ frente_base64, document_type: 'passport' }` sin `reverso_base64`

### 4c. Textos adaptativos

| Pantalla | id_card | passport |
|----------|---------|----------|
| Camera front | "Anverso de tu documento" | "Página de datos del pasaporte" |
| Camera back | "Reverso del documento" | *(skip)* |
| MRZ overlay | 3 líneas TD1 | 2 líneas TD3 |
| Analyzing | "Analizando documento..." | "Analizando pasaporte..." |
| NFC position | "Acercá el documento al teléfono" | "Acercá el pasaporte al teléfono" |
| Error | "fotografiar ambas caras" | "fotografiar la página de datos" |

---

## Orden de ejecución

| Paso | Qué | Depende de | Archivos |
|------|-----|------------|----------|
| 1 | `mrz-parser.ts` | Nada | `src/kyc/mrz-parser.ts` (nuevo) |
| 2 | Prompts universales + refactor | Paso 1 | `src/kyc/kyc.service.ts` |
| 3 | Controller updates | Paso 2 | `src/kyc/kyc.controller.ts` |
| 4 | UI móvil | Paso 3 | `SafeRentMobile/app/kyc-movil.tsx` |

## Verificación

1. **Backend**: `npm run build` compila sin errores
2. **DNI español**: flujo completo (front+back → OCR → NFC) sigue funcionando como antes
3. **Pasaporte**: seleccionar "Pasaporte" → foto única de data page → OCR lee TD3 MRZ → NFC BAC pasa
4. **Corrección check digits**: funciona para TD1 y TD3 (probar con datos mock)
5. **Backward compatibility**: si no se envía `document_type`, asume `id_card` (TD1)
