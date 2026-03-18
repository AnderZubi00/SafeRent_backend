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

## Commands

```bash
# Development
npm run start:dev        # Run with hot-reload
npm run build            # Compile TypeScript to dist/
npm run start:prod       # Run compiled app

# Database
npm run seed             # Seed DB with test users
npx prisma migrate dev   # Run migrations in development
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

To run a single test file:
```bash
npx jest src/auth/auth.service.spec.ts
```

## Architecture

**NestJS 11** app with Prisma 7 + PostgreSQL (hosted on Supabase). All routes are prefixed with `/api/v1`.

### Module structure

```
src/
  app.module.ts          # Root module — loads ConfigModule globally, imports Auth
  prisma/                # Global PrismaModule/PrismaService (available everywhere)
  auth/                  # JWT auth: POST /api/v1/auth/login → returns JWT
  users/                 # (planned, empty)
  properties/            # (planned, empty)
  rentals/               # (planned, empty)
  payments/              # (planned, empty)
  contracts/             # (planned, empty)
  common/
    decorators/          # (planned, empty)
    filters/             # (planned, empty)
    guards/              # (planned, empty)
```

**PrismaModule** is global — inject `PrismaService` directly into any service without re-importing the module.

**AuthModule** exports `JwtModule` so other modules can verify tokens by importing `AuthModule`.

### Domain model (Prisma schema)

- **Usuario** — users with roles: `INQUILINO`, `PROPIETARIO`, `ADMINISTRADOR`. Tracks KYC verification and Stripe account.
- **Vivienda** — rental property owned by a `PROPIETARIO`. Defaults to city "Donostia-San Sebastián".
- **Reserva** — rental booking linking a `Vivienda` to an `INQUILINO`. State machine: `PENDIENTE → PAGO_RETENIDO → CONFIRMADO → COMPLETADO` (or `DISPUTA`/`CANCELADO`). Stripe PaymentIntent stored here.
- **DocumentoTemporal** — supporting documents attached to a `Reserva` (type: `ESTUDIOS`, `TRABAJO`, `OBRAS`, `SALUD`, `OTROS`).
- **ContratoDigital** — digital contract for a `Reserva`, signed via Signaturit. Tracks individual signing status for both parties.

### Database connection

Two connection strings are required:
- `DATABASE_URL` — pooled connection via PgBouncer (port 6543, used by Prisma at runtime)
- `DIRECT_URL` — direct connection (port 5432, used by Prisma for migrations)

Both point to Supabase. The `prisma.config.ts` file wires these together for CLI commands.

### Key integrations

- **Stripe** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) — payment processing and escrow via PaymentIntents
- **Signaturit** (`SIGNATURIT_API_KEY`) — digital contract signing, referenced in `ContratoDigital.id_firma_externa`
- **Supabase Storage** (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`) — file storage for documents and contract PDFs
- **Puppeteer** — PDF generation (installed as a dependency)

### Global setup (main.ts)

- `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`
- CORS: allows `localhost:3000` in dev, `FRONTEND_URL` env var in prod
- Runs on `PORT` env var (default 3001)

### Test users (after `npm run seed`)

| Role | Email | Password |
|------|-------|----------|
| Inquilino | `inquilino@saferent.es` | `Inquilino123!` |
| Propietario | `propietario@saferent.es` | `Propietario123!` |
| Admin | `admin@saferent.es` | `Admin123!` |
