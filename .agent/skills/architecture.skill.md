# Architecture Skill — SafeRent Backend

> **Cuándo cargar este skill:** cuando la tarea involucre estructura de módulos, bootstrap
> (`main.ts`), auth flow completo, comunicación inter-repo (frontend/mobile ↔ backend),
> o necesites entender el grafo de dependencias del proyecto.

---

## 1. Stack Tecnológico

| Capa | Tecnología | Notas |
|------|-----------|-------|
| Framework | NestJS 11 | Decoradores, módulos, inyección de dependencias |
| ORM | Prisma 7 | Con adaptador `PrismaPg` para conexión directa a PostgreSQL |
| Base de datos | PostgreSQL | Hospedado en Supabase (pooler + direct URL) |
| Autenticación | JWT (jsonwebtoken) | Tokens propios de SafeRent, no tokens de Supabase |
| Pagos | Stripe | PaymentIntents, webhooks |
| IA / OCR | OpenAI GPT-4o | Análisis de documentos KYC, visión |
| Email | Resend | Emails transaccionales (5 plantillas) |
| PDF | pdf-lib | Generación de contratos digitales |
| Notificaciones | Socket.io | WebSocket para notificaciones en tiempo real |
| Storage | Supabase Storage | Documentos de usuario, fotos de viviendas |

---

## 2. Module Dependency Graph

```
AppModule
  ├── ConfigModule          (global: true — @nestjs/config)
  ├── PrismaModule          (global — PrismaService para toda la app)
  ├── StorageModule          (global — Supabase Storage signed URLs)
  ├── EmailModule            (global — Resend integration)
  ├── AuthModule             (JWT auth: login, register, exchange, me)
  ├── ViviendasModule        (CRUD propiedades + búsqueda con filtros)
  ├── SolicitudesModule      (Ciclo de vida de solicitudes + auto-emails)
  ├── ContratosModule        (Generación PDF, firma de contratos)
  ├── PagosModule            (Registro de pagos + notificaciones email)
  ├── KycModule              (Sesiones KYC, OCR via GPT-4o, validación MRZ)
  ├── AdminModule            (Endpoints de administración)
  └── NotificationsModule    (WebSocket notifications via Socket.io)
```

Cada módulo sigue la convención: una carpeta en `src/` con `module.ts`, `controller.ts`,
`service.ts` y subcarpeta `dto/`.

---

## 3. Bootstrap — main.ts

```typescript
// Configuración clave en main.ts:
const app = await NestFactory.create(AppModule, { rawBody: true });

// Body parsing
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));

// JSON limit
// Configurado para aceptar hasta 10 MB (necesario para documentos KYC base64)

// Prefix global
app.setGlobalPrefix('api/v1');

// Exception filter
app.useGlobalFilters(new GlobalExceptionFilter());

// CORS
// Dev:  localhost:3000, localhost:3001, 192.168.x.x (red local para mobile)
// Prod: FRONTEND_URL env var

// Puerto
const port = process.env.PORT || 3001;
await app.listen(port);
```

**Puntos críticos:**
- `rawBody: true` es obligatorio para verificación de webhooks de Stripe.
- `forbidNonWhitelisted: true` rechaza propiedades desconocidas en DTOs (seguridad).
- `transform: true` convierte automáticamente payloads a instancias de DTO.
- JSON limit de 10 MB permite recibir documentos codificados en base64 para KYC.

---

## 4. Auth Flow Completo

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Frontend/Mobile │────▶│ Supabase Auth │────▶│ Obtiene token    │
│  (Next.js/Expo)  │     │              │     │ de Supabase      │
└─────────────────┘     └──────────────┘     └────────┬─────────┘
                                                       │
                                                       ▼
                                            POST /api/v1/auth/exchange
                                            { supabase_token: "..." }
                                                       │
                                                       ▼
                                            ┌──────────────────┐
                                            │  Backend verifica │
                                            │  token Supabase   │
                                            │  → busca/crea     │
                                            │    Usuario en BD  │
                                            │  → genera JWT     │
                                            │    de SafeRent    │
                                            └────────┬─────────┘
                                                       │
                                                       ▼
                                            { access_token: "<jwt>" }
                                                       │
                                                       ▼
                                            Todas las llamadas:
                                            Authorization: Bearer <jwt>
```

### Guards y Decoradores

| Guard/Decorador | Uso |
|----------------|-----|
| `JwtAuthGuard` | Verifica JWT en header `Authorization: Bearer`. Obligatorio para rutas protegidas. |
| `RolesGuard` | Lee metadata `@Roles()` y compara con `req.user.rol`. Requiere `JwtAuthGuard` antes. |
| `@Roles('PROPIETARIO')` | Decorador de metadata — indica qué roles pueden acceder al endpoint. |
| `@CurrentUser()` | Decorador de parámetro — extrae el usuario del request (`req.user`). |

**Uso típico en un controller:**
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PROPIETARIO')
@Get('mis-viviendas')
async misViviendas(@CurrentUser() user: Usuario) {
  return this.viviendasService.findByPropietario(user.id);
}
```

---

## 5. Prisma Schema — Modelos y Enums

### Enums

| Enum | Valores |
|------|---------|
| `Rol` | `INQUILINO`, `PROPIETARIO`, `ADMINISTRADOR` |
| `EstadoSolicitud` | `PENDIENTE`, `ACEPTADA`, `RECHAZADA` |
| `EstadoKyc` | `PENDIENTE`, `ESCANEANDO`, `COMPLETADO`, `FALLIDO` |

### Modelos y Relaciones

```
Usuario (1) ──────< Vivienda (N)        # propietario_id
Usuario (1) ──────< Solicitud (N)       # inquilino_id (como inquilino)
Usuario (1) ──────< Solicitud (N)       # propietario_id (como propietario)
Solicitud (1) ────── ContratoDigital (1) # solicitud_id (1:1)
Solicitud (1) ─────< Pago (N)           # solicitud_id
Vivienda (1) ──────< Pago (N)           # vivienda_id
Usuario (1) ──────< KycSesion (N)       # usuario_id
```

**Resumen de cada modelo:**
- **Usuario** — nombre, email, telefono, rol, supabase_uid, foto_url, created_at
- **Vivienda** — titulo, descripcion, ciudad, direccion, precio, habitaciones, motivo, fotos, propietario_id
- **Solicitud** — estado (EstadoSolicitud), mensaje, motivo_rechazo, inquilino_id, propietario_id, vivienda_id
- **ContratoDigital** — pdf_url, firmado_propietario, firmado_inquilino, fecha_firma_propietario, fecha_firma_inquilino, solicitud_id
- **Pago** — monto, concepto, stripe_payment_intent_id, solicitud_id, vivienda_id, inquilino_id, propietario_id
- **KycSesion** — estado (EstadoKyc), tipo_documento, datos_extraidos (JSON), safe_score (Int?, nullable), usuario_id

---

## 6. Endpoint Map

Todos los endpoints llevan el prefijo `/api/v1`.

### Auth
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/login` | Login con email/password |
| POST | `/auth/register` | Registro de nuevo usuario |
| POST | `/auth/exchange` | Intercambio token Supabase → JWT SafeRent |
| GET | `/auth/me` | Perfil del usuario autenticado |

### Viviendas
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/viviendas` | Listar viviendas con filtros |
| GET | `/viviendas/:id` | Detalle de una vivienda |
| POST | `/viviendas` | Crear vivienda (PROPIETARIO) |
| PATCH | `/viviendas/:id` | Actualizar vivienda (PROPIETARIO, owner) |
| GET | `/viviendas/mis-viviendas` | Viviendas del propietario autenticado |

### Solicitudes
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/solicitudes` | Crear solicitud (INQUILINO) |
| GET | `/solicitudes/inquilino` | Solicitudes del inquilino autenticado |
| GET | `/solicitudes/propietario` | Solicitudes recibidas por el propietario |
| POST | `/solicitudes/:id/aceptar` | Aceptar solicitud (PROPIETARIO) |
| POST | `/solicitudes/:id/rechazar` | Rechazar solicitud (PROPIETARIO) |

### Contratos
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/contratos/generar` | Generar PDF de contrato |
| GET | `/contratos/solicitud/:id` | Obtener contrato de una solicitud |
| POST | `/contratos/:id/firmar` | Firmar contrato (propietario o inquilino) |

### Pagos
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/pagos` | Registrar pago |
| GET | `/pagos/inquilino` | Pagos del inquilino autenticado |
| GET | `/pagos/propietario` | Pagos recibidos por el propietario |

### KYC
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/kyc/sesion` | Crear sesión KYC |
| POST | `/kyc/analizar` | Analizar documento (OCR parcial) |
| POST | `/kyc/analizar/completo` | Análisis completo de documentos |
| GET | `/kyc/estado` | Estado de KYC del usuario |

### Admin
Endpoints de administración (requieren rol `ADMINISTRADOR`).

---

## 7. Inter-repo Communication

```
┌──────────────┐     HTTP + JWT      ┌──────────────────┐
│  Frontend    │ ──────────────────▶ │                  │
│  (Next.js)   │  src/lib/api.ts     │  SafeRent Backend │
│              │                     │  (este repo)      │
└──────────────┘                     │                  │
                                     │  NestJS 11       │
┌──────────────┐     HTTP + JWT      │  /api/v1/*       │
│  Mobile      │ ──────────────────▶ │                  │
│  (Expo)      │  lib/api.ts         │                  │
└──────────────┘                     └──────────────────┘
```

**Principio clave:** El backend es la **única fuente de verdad** para toda lógica de negocio.

- **Frontend** (`SafeRent_front`): Next.js app. Archivo `src/lib/api.ts` contiene todas las
  funciones que llaman al backend via HTTP con JWT en header `Authorization`.
- **Mobile** (`SafeRent_mobile`): Expo/React Native app. Archivo `lib/api.ts` con la misma
  estructura de llamadas HTTP.
- **Supabase** se usa por los clientes **SOLO** para:
  1. Auth state (login/signup UI) — el token resultante se intercambia por JWT de SafeRent.
  2. Storage display URLs — para mostrar imágenes/documentos en la UI.
- **Toda operación de negocio** (crear solicitud, aceptar, generar contrato, registrar pago,
  KYC) pasa por el backend. Los clientes nunca escriben directamente en la BD.

---

## 8. Decision Tree — Cuándo Cargar Este Skill

**Carga `architecture.skill.md` si la tarea involucra:**
- Entender la estructura general del proyecto
- Modificar `main.ts` (bootstrap, CORS, pipes, filtros)
- Añadir o reorganizar módulos en `AppModule`
- Entender el flujo de autenticación completo
- Comunicación entre frontend/mobile y backend
- Decidir dónde colocar nueva funcionalidad
- Debugging de problemas de arranque o configuración

**NO cargues este skill si:**
- Solo necesitas trabajar en un módulo específico (carga el skill del dominio)
- La tarea es únicamente de Prisma/migraciones (carga `database.skill.md`)
- Solo necesitas detalles de Stripe/pagos (carga `stripe.skill.md`)

---

## 9. Guardrails de Arquitectura

1. **No crear módulos "utility" genéricos** — cada módulo debe corresponder a un dominio de negocio.
2. **No importar servicios entre módulos directamente** — usar `exports` en el módulo proveedor
   e `imports` en el consumidor.
3. **ConfigModule es global** — nunca re-importar `ConfigModule` en módulos hijos.
4. **PrismaModule es global** — `PrismaService` está disponible en toda la app sin importar.
5. **No añadir lógica de negocio en controllers** — los controllers solo validan input (via DTOs)
   y delegan al service.
6. **Mantener DTOs en subcarpeta `dto/`** — con decoradores `class-validator` obligatorios.
7. **Respetar el prefijo `/api/v1`** — todos los endpoints deben estar bajo este prefijo.
8. **rawBody debe permanecer en true** — necesario para verificación de webhooks de Stripe.
