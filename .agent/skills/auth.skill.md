# Skill: Auth, JWT & RBAC

> Cargado cuando: autenticación, JWT, guards, roles, decoradores, sesiones, RBAC.

---

## Estado Actual del Módulo

`src/auth/` está implementado con:
- `POST /api/v1/auth/login` → valida email+password con bcrypt → devuelve JWT (7 días)
- `AuthModule` exporta `JwtModule` para uso en otros módulos

**Pendiente de implementar:** `JwtAuthGuard`, `RolesGuard`, `@Roles()` decorator,
refresh tokens, registro de usuarios.

---

## Arquitectura de Guards

### JwtAuthGuard

```typescript
// src/common/guards/jwt-auth.guard.ts
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

Requiere registrar `PassportModule` y `JwtStrategy` en `AuthModule`.

### JwtStrategy

```typescript
// src/auth/jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string; rol: Rol }) {
    return { id: payload.sub, email: payload.email, rol: payload.rol };
    // Este objeto queda disponible como req.user en controllers
  }
}
```

### RolesGuard

```typescript
// src/common/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Rol[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true; // Sin @Roles() = autenticado, cualquier rol
    const { user } = context.switchToHttp().getRequest();
    return roles.includes(user.rol);
  }
}
```

---

## Decoradores Personalizados

### @Roles() — Restricción de rol

```typescript
// src/common/decorators/roles.decorator.ts
export const Roles = (...roles: Rol[]) => SetMetadata('roles', roles);
```

### @CurrentUser() — Obtener usuario del request

```typescript
// src/common/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return data ? request.user[data] : request.user;
  },
);
```

### Uso combinado en un controller

```typescript
@Get('mis-reservas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.INQUILINO)
async getMisReservas(@CurrentUser('id') usuarioId: string) {
  return this.reservasService.findByInquilino(usuarioId);
}
```

---

## JWT Payload

```typescript
interface JwtPayload {
  sub: string;    // Usuario.id (UUID)
  email: string;
  rol: Rol;       // INQUILINO | PROPIETARIO | ADMINISTRADOR
  iat: number;
  exp: number;    // 7 días desde emisión
}
```

**Nunca incluir en el payload:** `contrasena_hash`, datos bancarios, documentos.

---

## Endpoints de Auth (planificados)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/auth/login` | No | Login con email+password ✅ (implementado) |
| `POST` | `/auth/register` | No | Registro de nuevo usuario |
| `POST` | `/auth/refresh` | Refresh token | Renovar access token |
| `POST` | `/auth/logout` | JWT | Revocar token (blacklist en Redis/Supabase) |
| `GET` | `/auth/me` | JWT | Perfil del usuario autenticado |

---

## Registro de Usuarios

Al crear un `Usuario`:
1. Hashear password con `bcrypt.hash(password, 12)` (cost factor 12).
2. Nunca guardar la password en texto plano.
3. `verificado_kyc` comienza en `false` — se activa tras validación KYC.
4. `stripe_account_id` comienza en `null` — se asigna en onboarding de Stripe Connect.

---

## Ownership Check — Patrón Estándar

Para cualquier recurso protegido, validar en el service (no en el controller):

```typescript
async getDocumento(documentoId: string, usuarioId: string, userRol: Rol) {
  const doc = await this.prisma.documentoTemporal.findUnique({
    where: { id: documentoId },
    include: { reserva: true },
  });
  if (!doc) throw new NotFoundException('Documento no encontrado');

  const isOwner = doc.reserva.inquilino_id === usuarioId;
  const isAdmin = userRol === Rol.ADMINISTRADOR;
  if (!isOwner && !isAdmin) throw new ForbiddenException('Sin acceso');

  return doc;
}
```

---

## Registro Global de Guards

En `app.module.ts` o `main.ts`, registrar globalmente si se decide:

```typescript
// Opción A: global en main.ts (requiere inyección manual)
// Opción B: proveedor global en AppModule (recomendado)
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
],
```

Con guards globales, usar `@Public()` decorator para rutas sin auth (login, register, webhook).

---

## Guardrails Específicos

- `JWT_SECRET` mínimo 64 caracteres aleatorios. Nunca usar strings predecibles.
- No implementar "remember me" sin refresh token dedicado con rotación.
- Los refresh tokens deben ser de un solo uso (rotación) — guardar hash en BD, no el token raw.
- Bloquear cuenta tras N intentos fallidos de login (rate limiting por IP + email).
