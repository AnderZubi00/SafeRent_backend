# Plan: Reestructuración Arquitectónica — Backend como Cerebro

## Contexto

SafeRent tiene 3 proyectos: backend (NestJS), frontend (Next.js) y mobile (Expo/React Native). Actualmente el backend solo tiene un endpoint de login — toda la lógica de negocio vive en el frontend y mobile mediante llamadas directas a Supabase con la `anon key`. Esto genera:

- **Lógica duplicada** entre frontend y mobile (mismos archivos `lib/*.ts`)
- **Sin validación servidor** — la seguridad depende 100% de las políticas RLS de Supabase
- **Sin auditoría** — no hay logs de quién hizo qué
- **Emails disparados desde el frontend** — race conditions y falta de fiabilidad
- **Polling cada 10s** en vez de notificaciones en tiempo real
- **Esquema Prisma desincronizado** con la BD real (Prisma tiene `reservas` con estados `PAGO_RETENIDO/CONFIRMADO/COMPLETADO`, la BD real tiene `solicitudes` con estados `PENDIENTE/ACEPTADA/RECHAZADA`)

El objetivo es que el backend sea la **única puerta de entrada** a la BD y lógica de negocio. Frontend y mobile solo renderizan UI y llaman endpoints REST.

---

## Decisión Clave: Autenticación

**Mantener Supabase Auth + intercambio por JWT del backend.**

1. El usuario hace login/registro con Supabase Auth (como ahora)
2. El frontend/mobile llama `POST /api/v1/auth/exchange` enviando el Supabase access token
3. El backend verifica el token contra Supabase, busca el usuario en la BD, y devuelve un JWT propio
4. Todas las llamadas posteriores usan el JWT del backend en `Authorization: Bearer <token>`

Esto evita romper el flujo actual de autenticación y permite una migración gradual.

---

## Fase 1: Fundación (semana 1)

**Objetivo:** Infraestructura base del backend sobre la que se construye todo lo demás.

### 1.1 Sincronizar Prisma con la BD real

El esquema actual de Prisma (`prisma/schema.prisma`) no refleja la realidad. Cambios necesarios:

- Ejecutar `npx prisma db pull` para ver el esquema real
- Reescribir `schema.prisma` para que coincida, incluyendo:
  - **`Solicitud`** (tabla `solicitudes`): `propietario_id`, `motivo`, `motivo_detalle`, `documento_identidad_url`, `documento_justificativo_url`, `fecha_entrada`, `fecha_salida`, `estado` (PENDIENTE/ACEPTADA/RECHAZADA), `motivo_rechazo`
  - **`Vivienda`**: añadir `titulo`, `descripcion`, `barrio`, `habitaciones`, `banos`, `m2`, `motivos` (String[]), `activa`, `disponible_desde`, `estancia_minima`, `estancia_maxima`, `fotos` (String[])
  - **`ContratoDigital`**: añadir `solicitud_id`, `pdf_borrador_url`, `firma_propietario_img`, `firma_inquilino_img`
  - **`Pago`** (modelo nuevo, tabla `pagos`): `solicitud_id`, `inquilino_id`, `vivienda_id`, `concepto`, `importe`, `estado`, `fecha_pago`, `metodo`
  - **`KycSesion`** (modelo nuevo, tabla `kyc_sesiones`): `usuario_id`, `token`, `estado`, `safe_score`, `nfc_verificado`, `expira_en`
  - Eliminar `Reserva`, `DocumentoTemporal`, `EstadoReserva`, `MotivoTemporalidad` del esquema (si no existen en la BD)

**Archivos a modificar:** `SafeRent_backend/prisma/schema.prisma`

### 1.2 Infraestructura común

Crear en `SafeRent_backend/src/common/`:

| Archivo | Propósito |
|---------|-----------|
| `guards/jwt-auth.guard.ts` | Valida JWT en cabecera `Authorization: Bearer` |
| `guards/roles.guard.ts` | Verifica `@Roles('PROPIETARIO')` contra `req.user.rol` |
| `decorators/current-user.decorator.ts` | `@CurrentUser()` extrae payload del JWT |
| `decorators/roles.decorator.ts` | `@Roles()` decorator de metadata |
| `filters/http-exception.filter.ts` | Respuestas de error estandarizadas |

### 1.3 Extender módulo Auth

Añadir endpoints al `AuthController` existente:

| Endpoint | Descripción |
|----------|-------------|
| `POST /auth/register` | Registra usuario (bcrypt hash + inserción en BD) |
| `POST /auth/exchange` | Acepta Supabase token → verifica → devuelve JWT backend |
| `GET /auth/me` | Devuelve perfil del usuario autenticado |

**Dependencia nueva:** `@supabase/supabase-js` (para verificar tokens de Supabase)

**Archivos a modificar:** `src/auth/auth.controller.ts`, `src/auth/auth.service.ts`, nuevos DTOs

### 1.4 Verificación

- `POST /api/v1/auth/exchange` con un token de Supabase devuelve JWT del backend
- `GET /api/v1/auth/me` con el JWT devuelve el perfil del usuario

---

## Fase 2: Viviendas + Storage (semana 2)

**Objetivo:** CRUD de propiedades a través del backend.

### 2.1 Módulo Storage

`src/storage/storage.service.ts` — wrapper del cliente Supabase Storage con `SUPABASE_SERVICE_ROLE_KEY`:

- `generateSignedUploadUrl(bucket, path)` → URL firmada para subida directa
- `getPublicUrl(bucket, path)` → URL pública
- `deleteFile(bucket, path)`

### 2.2 Módulo Viviendas

`src/viviendas/` — CRUD completo:

| Endpoint | Auth/Rol | Descripción |
|----------|----------|-------------|
| `GET /viviendas` | Público | Listado con filtros (ciudad, motivo, precio, habitaciones) |
| `GET /viviendas/:id` | Público | Detalle de vivienda |
| `POST /viviendas` | PROPIETARIO | Crear vivienda |
| `PATCH /viviendas/:id` | PROPIETARIO (owner) | Actualizar vivienda |
| `GET /viviendas/mis-viviendas` | PROPIETARIO | Mis viviendas |
| `POST /viviendas/:id/fotos/upload-url` | PROPIETARIO | Obtener URL firmada para subir fotos |

**Lógica a migrar desde:** `SafeRent/src/lib/viviendas.ts` (223 líneas)

### 2.3 Actualizar frontend

- Actualizar `src/lib/api.ts` para inyectar JWT en cabecera Authorization
- Reescribir `src/lib/viviendas.ts`: reemplazar llamadas `supabase.from("viviendas")` por `api.get("/viviendas")`, `api.post("/viviendas", data)`, etc.
- Actualizar `AuthContext.tsx` para llamar `/auth/exchange` tras login de Supabase y almacenar el JWT

---

## Fase 3: Solicitudes + Email (semana 3)

**Objetivo:** Ciclo de vida de solicitudes gestionado por el backend con emails automáticos.

### 3.1 Módulo Email

`src/email/email.service.ts` — integración con Resend, migrado desde `SafeRent/src/lib/email.ts`:

- `sendSolicitudRecibida()` — notifica al propietario
- `sendSolicitudAceptada()` — notifica al inquilino
- `sendSolicitudRechazada()` — notifica al inquilino
- `sendContratoListo()` — notifica al inquilino
- `sendPagoRecibido()` — notifica al propietario

### 3.2 Módulo Solicitudes

`src/solicitudes/` — el módulo más crítico:

| Endpoint | Auth/Rol | Descripción |
|----------|----------|-------------|
| `POST /solicitudes` | INQUILINO | Crear solicitud (valida, inserta, envía email al propietario) |
| `GET /solicitudes/inquilino` | INQUILINO | Mis solicitudes como inquilino |
| `GET /solicitudes/propietario` | PROPIETARIO | Solicitudes de mis viviendas |
| `GET /solicitudes/:id` | Auth | Detalle con joins (vivienda + usuario) |
| `GET /solicitudes/:id/estado` | Auth | Estado + contrato asociado |
| `POST /solicitudes/:id/aceptar` | PROPIETARIO (owner) | Aceptar → genera contrato + email |
| `POST /solicitudes/:id/rechazar` | PROPIETARIO (owner) | Rechazar con motivo + email |
| `POST /solicitudes/:id/docs/upload-url` | INQUILINO | URLs firmadas para subir documentos |

**Lógica clave que se centraliza:**
- `aceptar()` ahora: valida ownership → actualiza estado → genera contrato PDF (llama ContratosService) → envía email → todo en una transacción
- Los emails ya NO se disparan desde el frontend

**Lógica a migrar desde:** `SafeRent/src/lib/solicitudes.ts` (283 líneas)

### 3.3 Actualizar frontend y mobile

- Reescribir `src/lib/solicitudes.ts` (frontend) con llamadas API
- Reescribir `lib/solicitudes.ts` (mobile) con llamadas API
- Eliminar `src/app/api/email/route.ts` del frontend

---

## Fase 4: Contratos + Pagos (semana 4)

**Objetivo:** Generación de PDF, firma digital y pagos a través del backend.

### 4.1 Módulo Contratos

`src/contratos/`:

| Endpoint | Auth/Rol | Descripción |
|----------|----------|-------------|
| `POST /contratos/generar` | PROPIETARIO | Genera PDF del contrato |
| `GET /contratos/solicitud/:solicitudId` | Auth | Contrato por solicitud |
| `POST /contratos/:id/firmar` | Auth | Firma (rol determinado por JWT) |

- `ContratosPdfService`: migra lógica de `SafeRent/src/app/api/contratos/generar/route.ts` (289 líneas, usa `pdf-lib`)
- `ContratosService`: orquesta generación → subida a Storage → creación de registro
- Al firmar: verifica si ambas partes han firmado → marca `fecha_firma_completa`

**Lógica a migrar desde:** `SafeRent/src/lib/contratos.ts` (126 líneas) + `SafeRent/src/app/api/contratos/generar/route.ts`

### 4.2 Módulo Pagos

`src/pagos/`:

| Endpoint | Auth/Rol | Descripción |
|----------|----------|-------------|
| `POST /pagos` | INQUILINO | Registrar pago |
| `GET /pagos/inquilino` | INQUILINO | Mis pagos |
| `GET /pagos/propietario` | PROPIETARIO | Pagos de mis viviendas |
| `POST /pagos/create-intent` | INQUILINO | Crear Stripe PaymentIntent |
| `POST /pagos/webhook` | Stripe | Webhook de Stripe |

**Lógica a migrar desde:** `SafeRent/src/lib/pagos.ts` (108 líneas)

### 4.3 Actualizar frontend y mobile

- Reescribir `src/lib/contratos.ts` y `src/lib/pagos.ts` con llamadas API
- Eliminar `src/app/api/contratos/generar/route.ts` del frontend

---

## Fase 5: KYC/OCR (semana 5)

**Objetivo:** Análisis de documentos de identidad a través del backend.

### 5.1 Módulo KYC

`src/kyc/`:

| Endpoint | Auth | Descripción |
|----------|------|-------------|
| `POST /kyc/sesion` | Auth | Crear sesión KYC |
| `POST /kyc/analizar` | Auth | Analizar documento (OpenAI GPT-4o) |
| `POST /kyc/analizar/completo` | Auth | Análisis frontal + trasero |
| `GET /kyc/estado` | Auth | Estado de verificación KYC |

- Migrar toda la lógica de OCR desde `SafeRent/src/app/api/kyc/analizar/route.ts` (602 líneas)
- Incluye: llamada a OpenAI Vision, parseo MRZ, validación de check digits ICAO 9303, cálculo de safe_score
- La verificación NFC **permanece en el mobile** (requiere acceso al chip físico del DNI)

**Lógica a migrar desde:** `SafeRent/src/app/api/kyc/analizar/route.ts` + `SafeRent/src/app/api/kyc/sesion/route.ts`

### 5.2 Actualizar frontend y mobile

- Eliminar todas las API routes del frontend (`src/app/api/`)
- Mobile: `kyc-movil.tsx` llama al backend en vez de al frontend para OCR

---

## Fase 6: Real-time + Limpieza (semana 6)

**Objetivo:** Reemplazar polling por WebSockets. Eliminar todas las llamadas directas a Supabase.

### 6.1 WebSocket Gateway

`src/notifications/notifications.gateway.ts`:

- Socket.IO con autenticación JWT
- Cada usuario se une a room `user:<userId>` al conectar
- Los servicios emiten eventos tras mutaciones: `solicitud:updated`, `contrato:signed`, `pago:created`
- Frontend/mobile escuchan y actualizan estado reactivamente

### 6.2 Limpieza final

**Frontend — eliminar:**
- `src/lib/supabase/client.ts` y `src/lib/supabase/server.ts` (ya no se usan para datos)
- Todas las API routes en `src/app/api/`
- Dependencia `@supabase/supabase-js` del frontend (o mantener solo para auth listener durante transición)

**Mobile — eliminar:**
- `lib/supabase.ts`
- Llamadas directas a Supabase en todos los `lib/*.ts`

**Mantener en mobile:**
- `lib/bac.ts` y `lib/nfc-passport.ts` (verificación NFC local)

---

## Estructura final del backend

```
SafeRent_backend/src/
├── main.ts
├── app.module.ts
├── common/
│   ├── guards/        (jwt-auth.guard, roles.guard)
│   ├── decorators/    (@CurrentUser, @Roles)
│   └── filters/       (http-exception.filter)
├── prisma/            (existente, sin cambios)
├── auth/              (existente, extendido con register + exchange)
├── users/             (GET/PATCH perfil)
├── viviendas/         (CRUD completo + filtros)
├── solicitudes/       (ciclo de vida completo + orquestación)
├── contratos/         (generación PDF + firma digital)
├── pagos/             (registro + Stripe)
├── kyc/               (OCR + sesiones + safe_score)
├── email/             (Resend integration)
├── storage/           (signed URLs para Supabase Storage)
└── notifications/     (WebSocket gateway)
```

## Verificación end-to-end

Para validar cada fase:

1. **Auth:** Login desde frontend → exchange → usar JWT para llamar endpoints protegidos
2. **Viviendas:** Crear, listar, filtrar propiedades desde el frontend sin llamadas Supabase directas
3. **Solicitudes:** Crear solicitud como inquilino → propietario acepta → se genera contrato y email automáticos
4. **Contratos:** Ambas partes firman → `fecha_firma_completa` se establece
5. **KYC:** Subir foto de DNI → backend analiza con OpenAI → devuelve safe_score
6. **Real-time:** Aceptar solicitud → inquilino recibe notificación WebSocket inmediatamente (sin polling)

## Archivos críticos existentes a reutilizar

| Archivo | Qué tiene | Para qué sirve |
|---------|-----------|-----------------|
| `SafeRent/src/lib/api.ts` | Cliente HTTP con `api.get/post/patch/delete` | Base para todas las llamadas frontend→backend (solo añadir JWT) |
| `SafeRent/src/app/api/kyc/analizar/route.ts` | 602 líneas de OCR + MRZ + ICAO | Migrar íntegro al módulo KYC del backend |
| `SafeRent/src/app/api/contratos/generar/route.ts` | Generación PDF con pdf-lib | Migrar al módulo Contratos del backend |
| `SafeRent/src/lib/email.ts` | Templates de email + Resend | Migrar al módulo Email del backend |
| `SafeRent_backend/src/auth/auth.service.ts` | Login con bcrypt + JWT | Extender con register y exchange |
| `SafeRent_backend/prisma/schema.prisma` | Schema actual (desincronizado) | Reescribir para reflejar BD real |

  cd SafeRent_backend && npm install && npx prisma generate                        
  cd ../SafeRent && npm install                                                                                                            
  cd ../SafeRentMobile && npm install
                                                                                                                                             Y añadir EXPO_PUBLIC_API_URL=http://localhost:3001 al .env del mobile.   