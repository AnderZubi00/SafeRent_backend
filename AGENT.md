# AGENT.md — SafeRent Orchestrator Index

> Este archivo actúa como **router de contexto**. Carga únicamente el skill relevante
> para la tarea actual. No cargues todos los skills a la vez — es context overload.

---

## 1. Proyecto

**SafeRent** — Plataforma PropTech (Donostia-San Sebastián, 2026) para alquiler temporal
verificado. Conecta propietarios con inquilinos mediante KYC automatizado, escrow de pagos,
contratos digitales y un sistema de puntuación de confianza llamado **SafeScore**.

Stack: `NestJS 11` · `Prisma 7` · `PostgreSQL` (Supabase) · `OpenAI API` ·
`Stripe` · `Signaturit` · `Supabase Storage` · `Socket.io`

API prefix global: `/api/v1`

---

## 2. Reglas de Activación de Skills (Lazy Loading)

Lee la tarea actual y carga **únicamente** el skill indicado:

| Si la tarea involucra... | Carga este skill |
|---|---|
| Pagos, escrow, PaymentIntents, Stripe Connect, webhooks de Stripe | `.agent/skills/stripe.skill.md` |
| KYC, documentos de usuario, SafeScore, OpenAI Vision, validación IA | `.agent/skills/kyc-ai.skill.md` |
| Autenticación, JWT, guards, roles, decoradores, RBAC | `.agent/skills/auth.skill.md` |
| Schema Prisma, migraciones, decisiones de BD | `.agent/skills/database.skill.md` |
| Contratos digitales, Signaturit, PDF, ContratoDigital | `.agent/skills/contracts.skill.md` |
| Estructura de módulos, bootstrap, auth flow, comunicación inter-repo | `.agent/skills/architecture.skill.md` |
| Supabase Auth, RLS, Storage, signed URLs, MCP, migraciones vía Supabase CLI | `.agent/skills/supabase/SKILL.md` |
| Optimización de queries SQL, índices, connection pooling, schema design, performance de BD | `.agent/skills/supabase-postgres-best-practices/SKILL.md` |

**Regla compuesta:** Si la tarea toca dos dominios (ej. KYC + BD), carga ambos skills.
Nunca cargues un skill preventivamente.

---

## 3. Guardrails — Reglas No Negociables

### 3.1 Privacidad (GDPR / Ley Orgánica 3/2018)
- **PROHIBIDO** usar documentos de usuario en Supabase Storage (URLs de solicitudes) como input
  de fine-tuning o entrenamiento de ningún modelo.
- Los documentos se procesan en memoria (sin persistencia en logs de OpenAI). Usar
  `{ store: false }` en todas las llamadas a la OpenAI API que procesen documentos.
- Los URLs de Supabase Storage deben ser **signed URLs** con TTL ≤ 60 s. Nunca URLs
  públicas permanentes para documentos de identidad.
- Al eliminar una reserva o usuario: borrar físicamente sus documentos de Storage
  (no solo la referencia en BD).

### 3.2 Seguridad en Endpoints de Documentos
Cada endpoint que sirva o reciba un documento de usuario **debe** cumplir:
1. `JwtAuthGuard` activo (autenticación obligatoria).
2. `RolesGuard` con el rol mínimo apropiado.
3. Validación de ownership: el usuario autenticado debe ser propietario del recurso
   (`solicitud.inquilino_id === req.user.id` o rol `ADMINISTRADOR`).
4. Validación del tipo MIME y tamaño antes de subir a Storage.
5. Registro de auditoría (quién accedió, cuándo) — usar un interceptor dedicado.

### 3.3 Webhooks
- Los webhooks de Stripe deben verificarse con `stripe.webhooks.constructEvent`.
  **Nunca** confiar en el body sin verificar la firma.
- Los webhooks de Signaturit deben validarse con el token de la cabecera.

### 3.4 Schema
- Nunca eliminar una columna en una migración sin confirmar con el usuario primero.
- Nunca exponer `contrasena_hash` en ninguna respuesta de API.

---

## 4. Protocolo de Memoria (Engram)

Usa `mem_save` (servidor MCP Engram) para registrar decisiones arquitectónicas.
Formato estándar de guardado:

```
Categoría: [SCHEMA | SAFESCORE | PAYMENT | CONTRACT | AUTH | INFRA]
Decisión: <descripción concisa>
Motivo: <por qué se tomó esta decisión>
Alternativas descartadas: <qué otras opciones se evaluaron>
Fecha: <ISO 8601>
```

**Cuándo guardar obligatoriamente:**
- Cualquier cambio al schema de Prisma (nuevos modelos, campos, índices).
- Cambios en la lógica de cálculo del SafeScore.
- Cambios en el flujo de estados de `EstadoSolicitud`.
- Decisiones sobre qué datos enviar a OpenAI vs. procesar localmente.
- Cambios en la estructura de comisiones de Stripe.

**Cuándo consultar antes de actuar:**
- Antes de crear una migración destructiva.
- Antes de cambiar pesos del SafeScore.
- Antes de modificar el flujo de firma de contratos.

---

## 5. Dominio — Flujos Principales

### 5.1 Flujo de Solicitud (happy path)
```
PENDIENTE
  → [propietario revisa solicitud + documentos del inquilino]
ACEPTADA
  → [se genera ContratoDigital con PDF]
  → [ambas partes firman]
  → [se registran pagos: primer_mes + fianza + comisión]
```
Estado alternativo: `RECHAZADA` (propietario rechaza, con motivo opcional).

### 5.2 Roles y Permisos
| Rol | Puede |
|---|---|
| `INQUILINO` | Ver/solicitar viviendas, subir documentos propios, ver sus solicitudes |
| `PROPIETARIO` | CRUD de sus viviendas, aceptar/rechazar solicitudes, ver docs del inquilino |
| `ADMINISTRADOR` | Acceso completo, verificar viviendas, resolver disputas |

### 5.3 SafeScore (planificado)
Campo `KycSesion.safe_score` (Int?, nullable) existe en el schema pero **no tiene lógica de cálculo implementada**. El campo se reserva para futuro motor de confianza.

---

## 6. Convenciones de Código

- **Idioma:** nombres de variables/modelos en español (alineado con el schema Prisma).
  Nombres de clases NestJS en inglés (`UsuariosService`, `SolicitudesController`, `ContratosController`, `PagosController`).
- **DTOs:** siempre en `src/<modulo>/dto/`. Decoradores `class-validator` obligatorios.
- **Respuestas de error:** usar `HttpException` de NestJS con mensajes en español.
- **Tests unitarios:** un archivo `.spec.ts` por cada servicio. Mocks de `PrismaService` con
  `jest.fn()`.
- **Un módulo = una carpeta** en `src/`. Estructura interna:
  ```
  src/<modulo>/
    <modulo>.module.ts
    <modulo>.controller.ts
    <modulo>.service.ts
    dto/
    <modulo>.controller.spec.ts
    <modulo>.service.spec.ts
  ```

---

## 7. Variables de Entorno Requeridas

```
NODE_ENV, PORT
DATABASE_URL, DIRECT_URL          # Supabase PostgreSQL
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
JWT_SECRET
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
SIGNATURIT_API_KEY
OPENAI_API_KEY
RESEND_API_KEY
FRONTEND_URL
```

---

## 8. Índice de Skills

| Archivo | Dominio | Cuándo cargar |
|---|---|---|
| `.agent/skills/stripe.skill.md` | Pagos & Escrow | Stripe, PaymentIntents, comisiones |
| `.agent/skills/kyc-ai.skill.md` | KYC & SafeScore | Documentos, IA, validación |
| `.agent/skills/auth.skill.md` | Auth & RBAC | JWT, guards, decoradores |
| `.agent/skills/database.skill.md` | BD & Schema | Prisma, migraciones |
| `.agent/skills/contracts.skill.md` | Contratos | Signaturit, PDF, firma digital |
| `.agent/skills/architecture.skill.md` | Arquitectura & Bootstrap | Estructura de módulos, main.ts, auth flow, inter-repo |
| `.agent/skills/supabase/SKILL.md` | Supabase Platform | Auth, RLS, Storage, signed URLs, MCP, CLI, migrations |
| `.agent/skills/supabase-postgres-best-practices/SKILL.md` | Postgres Performance | Indexes, queries, connection pooling, schema design |
