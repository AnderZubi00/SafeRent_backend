# Skill: Database, Schema & Prisma

> Cargado cuando: schema Prisma, migraciones, pgvector, decisiones de BD, índices, queries.

---

## Configuración de Conexión

Dos URLs obligatorias (ver `.env`):
- `DATABASE_URL` → pooled (PgBouncer, puerto 6543, `pgbouncer=true`) — usar en runtime
- `DIRECT_URL` → directo (puerto 5432) — usar para migraciones

El archivo `prisma.config.ts` declara `migrationsDirPath` apuntando a `prisma/migrations/`.

```bash
# Migrations en desarrollo
npx prisma migrate dev --name <nombre_descriptivo>

# Aplicar en producción (sin generar nueva migración)
npx prisma migrate deploy

# Inspeccionar estado
npx prisma migrate status
```

---

## Schema Actual — Decisiones Clave

### Decisiones registradas

| Decisión | Motivo |
|---|---|
| `uuid()` como PK en todos los modelos | Evita enumeración, compatible con Supabase RLS |
| `ciudad` con default "Donostia-San Sebastián" | Fase 1 del producto es local; escalar a multitiudad después |
| `stripe_payment_intent @unique` | Una Reserva = un PaymentIntent; evitar duplicados de cobro |
| `@updatedAt` en `ultima_conexion` de Usuario | Tracking automático sin lógica extra |
| `ContratoDigital` separado de `Reserva` | Separación de concerns; el contrato puede tardar en generarse |

### Próximas columnas planificadas (NO añadir sin mem_save)

```prisma
// Usuario
safe_score        Int?              // Calculado por el motor KYC
perfil_embedding  Unsupported("vector(1536)")?  // pgvector

// Vivienda
descripcion       String?
imagenes_urls     String[]          // Array de paths en Supabase Storage
superficie_m2     Float?
num_habitaciones  Int?
disponible_desde  DateTime?
```

---

## Extensión pgvector

Para habilitar embeddings en Supabase:

```sql
-- Ejecutar en Supabase SQL Editor (una vez)
CREATE EXTENSION IF NOT EXISTS vector;
```

Luego crear la migración Prisma para la columna:

```prisma
// schema.prisma — campo embedding
perfil_embedding  Unsupported("vector(1536)")?
```

```sql
-- En la migración SQL generada, añadir índice HNSW para búsqueda eficiente
CREATE INDEX ON usuarios USING hnsw (perfil_embedding vector_cosine_ops);
```

### Query de similitud desde Prisma

```typescript
// Buscar usuarios con perfil similar (top 10)
const similares = await this.prisma.$queryRaw<Usuario[]>`
  SELECT id, nombre_completo, safe_score
  FROM usuarios
  ORDER BY perfil_embedding <=> ${embedding}::vector
  LIMIT 10
`;
```

---

## Convenciones de Migración

- Nombres descriptivos en snake_case: `add_safe_score_to_usuarios`, `create_auditoria_table`
- **Nunca** usar `migrate dev` en producción — solo `migrate deploy`
- Antes de `DROP COLUMN` o `DROP TABLE`: confirmar con el usuario, hacer backup, registrar en Engram
- Migraciones deben ser idempotentes cuando sea posible

---

## Índices Recomendados (pendientes de añadir)

```sql
-- Búsquedas frecuentes
CREATE INDEX idx_viviendas_ciudad ON viviendas(ciudad);
CREATE INDEX idx_viviendas_verificada ON viviendas(verificada) WHERE verificada = true;
CREATE INDEX idx_reservas_estado ON reservas(estado);
CREATE INDEX idx_reservas_inquilino ON reservas(inquilino_id);
CREATE INDEX idx_documentos_reserva ON documentos_temporales(reserva_id);
```

Añadirlos mediante una migración, no manualmente en Supabase.

---

## PrismaService

```typescript
// src/prisma/prisma.service.ts (implementado)
// Usa @prisma/adapter-pg para el adaptador de PostgreSQL
// Se conecta en onModuleInit(), desconecta en onModuleDestroy()
// PrismaModule es global → inyectar PrismaService directamente sin re-importar
```

---

## Patrones de Query Recomendados

### Paginación

```typescript
async findAll(page: number, limit: number) {
  const [data, total] = await this.prisma.$transaction([
    this.prisma.vivienda.findMany({
      skip: (page - 1) * limit,
      take: limit,
      where: { verificada: true },
      orderBy: { fecha_creacion: 'desc' },
    }),
    this.prisma.vivienda.count({ where: { verificada: true } }),
  ]);
  return { data, total, page, lastPage: Math.ceil(total / limit) };
}
```

### Transacción para operaciones multi-tabla

```typescript
// Crear Reserva + ContratoDigital en una sola transacción
const [reserva, contrato] = await this.prisma.$transaction([
  this.prisma.reserva.create({ data: reservaData }),
  this.prisma.contratoDigital.create({ data: contratoData }),
]);
```

### Select seguro (nunca exponer hash)

```typescript
const usuario = await this.prisma.usuario.findUnique({
  where: { id },
  select: {
    id: true,
    email: true,
    nombre_completo: true,
    rol: true,
    verificado_kyc: true,
    safe_score: true,
    // contrasena_hash: NUNCA incluir
  },
});
```

---

## Seed de Desarrollo

```bash
npm run seed   # Crea 3 usuarios de prueba (ver CLAUDE.md para credenciales)
```

El seed usa `upsert` para ser idempotente. No borra datos existentes.

---

## Guardrails Específicos

- Nunca usar `prisma.usuario.findMany()` sin `select` — siempre excluir `contrasena_hash`.
- Usar `$transaction` para cualquier operación que modifique ≥2 tablas relacionadas.
- Registrar en Engram toda decisión de nuevo índice o cambio de tipo de columna.
- No usar `deleteMany` sin condición `where` — añadir validación en el servicio.
- En Supabase, los cambios de schema via Prisma deben ir por migraciones, no por el dashboard.
