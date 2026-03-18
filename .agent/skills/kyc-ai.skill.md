# Skill: KYC & SafeScore (Motor de IA)

> Cargado cuando: validación de documentos, SafeScore, OpenAI, embeddings, pgvector, KYC.

---

## Principio de Privacidad — Regla Absoluta

**NUNCA** enviar documentos de usuario a OpenAI con `store: true` o sin especificar.
Siempre usar `{ store: false }` para que OpenAI no retenga los datos:

```typescript
const result = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [...],
  store: false,   // OBLIGATORIO en llamadas con documentos de usuario
});
```

Los documentos se obtienen como signed URLs (TTL 60 s) y se descargan localmente en
memoria antes de enviar a OpenAI. No se guardan paths temporales en disco.

---

## SafeScore — Definición y Propósito

Puntuación 0–100 por `Usuario` de tipo `INQUILINO`. Representa la confiabilidad
del inquilino basada en:

| Factor | Peso tentativo | Fuente |
|---|---|---|
| Documentos verificados válidos | 30% | OpenAI Vision |
| Historial de reservas completadas | 25% | tabla `reservas` |
| Tiempo de respuesta al propietario | 15% | métricas de interacción |
| Coherencia del motivo de temporalidad | 20% | NLP sobre documentos |
| Calidad del DNI/NIE verificado | 10% | Vision AI |

> **IMPORTANTE:** Los pesos son tentativos. Cualquier cambio debe registrarse en
> Engram con `mem_save` (categoría: SAFESCORE).

### Almacenamiento en pgvector

El SafeScore se complementa con un **embedding** del perfil del usuario almacenado
en pgvector para búsqueda de similitud y detección de patrones anómalos.

Schema de extensión requerida (migración):
```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE usuarios ADD COLUMN safe_score SMALLINT DEFAULT NULL;
ALTER TABLE usuarios ADD COLUMN perfil_embedding vector(1536);  -- text-embedding-3-small
```

---

## Flujo de Validación KYC

```
1. Inquilino sube documento → DocumentoTemporal creado (validado: false)
2. Job asíncrono (BullMQ o similar) consume el evento
3. Descargar doc desde Supabase Storage → signed URL (60s TTL)
4. Llamar OpenAI Vision (gpt-4o) con { store: false }
5. Extraer: tipo_documento, fecha_validez, nombre, coincidencia_con_perfil
6. Si válido → DocumentoTemporal.validado = true
7. Recalcular SafeScore del inquilino
8. Si SafeScore ≥ umbral → habilitar confirmación de reserva
```

---

## Módulo NestJS: KycModule

```
src/kyc/
  kyc.module.ts
  kyc.controller.ts    # Endpoints de subida y estado
  kyc.service.ts       # Orquestación del flujo
  kyc.dto.ts
  openai.service.ts    # Wrapper de OpenAI (inyectable)
  safescore.service.ts # Cálculo y persistencia del score
  kyc.service.spec.ts
  safescore.service.spec.ts
```

---

## Endpoints KYC

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/kyc/documentos/:reservaId` | `INQUILINO` | Subir documento de soporte |
| `GET` | `/kyc/documentos/:reservaId` | `INQUILINO`, `PROPIETARIO`, `ADMINISTRADOR` | Ver estado docs |
| `POST` | `/kyc/validar/:documentoId` | `ADMINISTRADOR` | Validación manual override |
| `GET` | `/kyc/safescore/:usuarioId` | `ADMINISTRADOR` | Obtener SafeScore de un usuario |
| `DELETE` | `/kyc/documentos/:documentoId` | `INQUILINO`, `ADMINISTRADOR` | Eliminar documento (+ Storage) |

**Seguridad en cada endpoint de documentos** (ver AGENT.md §3.2):
1. `JwtAuthGuard`
2. `RolesGuard`
3. Validación de ownership en el servicio
4. Validación MIME (`application/pdf`, `image/jpeg`, `image/png`) y tamaño (≤ 10 MB)
5. Registro de auditoría

---

## OpenAI Vision — Prompt de Validación de Documento

```typescript
const prompt = `
Analiza este documento. Responde ÚNICAMENTE en JSON válido con esta estructura:
{
  "tipo_documento": "dni" | "nie" | "contrato_trabajo" | "matricula" | "informe_medico" | "otro",
  "es_valido": boolean,
  "fecha_caducidad": "YYYY-MM-DD" | null,
  "nombre_detectado": string | null,
  "motivos_invalido": string[]
}
No incluyas texto fuera del JSON.
`;
```

---

## Subida a Supabase Storage

Buckets a crear:
- `documentos-kyc` — privado, acceso solo por service role
- `contratos-pdf` — privado, acceso por service role

```typescript
// Generar signed URL (TTL 60 segundos)
const { data } = await supabase.storage
  .from('documentos-kyc')
  .createSignedUrl(path, 60);
```

Naming convention para paths: `usuarios/{usuarioId}/reservas/{reservaId}/{uuid}.{ext}`

---

## Guardrails Específicos

- El campo `DocumentoTemporal.archivo_url` almacena el **path** en Storage, no una URL pública.
- Nunca retornar el `archivo_url` crudo en respuestas de API — siempre generar signed URL on-demand.
- Al cancelar una reserva: programar eliminación de sus `DocumentoTemporal` de Storage.
- Logs de llamadas a OpenAI: solo loguear `model`, `tokens`, `latency`. Nunca el contenido del prompt con datos de usuario.
- El SafeScore no es una decisión autónoma — el propietario siempre puede aceptar o rechazar manualmente.
