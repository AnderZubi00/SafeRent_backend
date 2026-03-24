# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent Orchestration

This project uses a skill-based lazy loading system. Before starting any non-trivial task,
read `AGENT.md` for routing rules, then load only the relevant skill from `.agent/skills/`:

| Domain | Skill file |
|---|---|
| Payments / Stripe | `.agent/skills/stripe.skill.md` |
| KYC / AI / SafeScore | `.agent/skills/kyc-ai.skill.md` |
| Auth / JWT / Guards | `.agent/skills/auth.skill.md` |
| Database / Prisma | `.agent/skills/database.skill.md` |
| Contracts / PDF / Signaturit | `.agent/skills/contracts.skill.md` |
| Estructura de módulos, bootstrap, comunicación inter-repo | `.agent/skills/architecture.skill.md` |

## Commands

```bash
# Development
npm run start:dev        # Run with hot-reload
npm run build            # Compile TypeScript to dist/
npm run start:prod       # Run compiled app

# Database
npm run seed             # Seed DB with test users
npx prisma migrate dev   # Run migrations in development
npx prisma generate      # Regenerate Prisma client
npx prisma studio        # Open Prisma Studio GUI

# Testing
npm test                 # Unit tests (*.spec.ts in src/)
npm run test:watch       # Unit tests in watch mode
npm run test:cov         # Unit tests with coverage
npm run test:e2e         # E2E tests (test/*.e2e-spec.ts)

# Code quality
npm run lint             # ESLint with auto-fix
npm run format           # Prettier format
```

## Architecture

**NestJS 11** app with Prisma 7 + PostgreSQL (hosted on Supabase). All routes are prefixed with `/api/v1`.

The backend is the **single source of truth** for all business logic. Frontend (Next.js) and mobile (Expo/React Native) are thin UI clients that only call backend REST endpoints.

### Module structure

```
src/
  app.module.ts          # Root module — loads all modules
  main.ts                # Bootstrap with ValidationPipe, CORS, GlobalExceptionFilter
  prisma/                # Global PrismaModule/PrismaService
  common/
    guards/              # JwtAuthGuard, RolesGuard
    decorators/          # @CurrentUser(), @Roles()
    filters/             # GlobalExceptionFilter
  auth/                  # JWT auth: login, register, exchange (Supabase→JWT), me
  storage/               # Global StorageModule — Supabase Storage signed URLs
  email/                 # Global EmailModule — Resend integration, 5 email templates
  viviendas/             # CRUD properties + search with filters
  solicitudes/           # Application lifecycle: create, accept, reject + auto-emails
  contratos/             # PDF generation (pdf-lib), contract signing
  pagos/                 # Payment registration + email notifications
  kyc/                   # KYC sessions, OCR analysis via OpenAI GPT-4o, MRZ validation
  notifications/         # WebSocket notifications via Socket.io
```

### Auth flow

1. User logs in via Supabase Auth (frontend/mobile)
2. Client calls `POST /api/v1/auth/exchange` with Supabase access token
3. Backend verifies token → returns SafeRent JWT
4. All subsequent API calls use `Authorization: Bearer <jwt>`

Guards: `@UseGuards(JwtAuthGuard)` for auth, `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('PROPIETARIO')` for role-based access.

### Domain model (Prisma schema)

- **Usuario** — roles: `INQUILINO`, `PROPIETARIO`, `ADMINISTRADOR`
- **Vivienda** — rental property with photos, filters (ciudad, motivo, precio, habitaciones)
- **Solicitud** — rental application: `PENDIENTE → ACEPTADA / RECHAZADA`
- **ContratoDigital** — PDF contract with dual signing (propietario + inquilino)
- **Pago** — payment records
- **KycSesion** — KYC verification sessions with OCR results

### API Endpoints

| Module | Endpoint | Auth |
|--------|----------|------|
| Auth | `POST /auth/login`, `POST /auth/register`, `POST /auth/exchange`, `GET /auth/me` | Mixed |
| Viviendas | `GET /viviendas`, `GET /viviendas/:id`, `POST /viviendas`, `PATCH /viviendas/:id`, `GET /viviendas/mis-viviendas` | Mixed |
| Solicitudes | `POST /solicitudes`, `GET /solicitudes/inquilino`, `GET /solicitudes/propietario`, `POST /solicitudes/:id/aceptar`, `POST /solicitudes/:id/rechazar` | JWT + Roles |
| Contratos | `POST /contratos/generar`, `GET /contratos/solicitud/:id`, `POST /contratos/:id/firmar` | JWT |
| Pagos | `POST /pagos`, `GET /pagos/inquilino`, `GET /pagos/propietario` | JWT + Roles |
| KYC | `POST /kyc/sesion`, `POST /kyc/analizar`, `POST /kyc/analizar/completo`, `GET /kyc/estado` | JWT |

### Key integrations

- **Stripe** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) — payment processing
- **Supabase Storage** (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) — file storage
- **OpenAI** (`OPENAI_API_KEY`) — KYC document OCR via GPT-4o
- **Resend** (`RESEND_API_KEY`) — transactional emails
- **pdf-lib** — PDF contract generation

### Global setup (main.ts)

- `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`
- `GlobalExceptionFilter` for standardized error responses
- CORS: allows `localhost` in dev, `FRONTEND_URL` env var in prod
- Runs on `PORT` env var (default 3001)

### Test users (after `npm run seed`)

| Role | Email | Password |
|------|-------|----------|
| Inquilino | `inquilino@saferent.es` | `Inquilino123!` |
| Propietario | `propietario@saferent.es` | `Propietario123!` |
| Admin | `admin@saferent.es` | `Admin123!` |
