# Skill: Stripe Payments & Escrow

> Cargado cuando: pagos, PaymentIntents, escrow, Stripe Connect, webhooks, comisiones.

---

## Modelo de Escrow SafeRent

SafeRent usa **Stripe PaymentIntents** en modo manual de captura para simular un escrow:

```
1. Inquilino inicia reserva → crear PaymentIntent con capture_method: 'manual'
2. Fondos autorizados (no cobrados) → Reserva.estado = PAGO_RETENIDO
3. KYC aprobado + propietario acepta → capturar parcialmente
4. Reserva completada → captura final liberada al propietario
5. Disputa → no capturar + investigar
6. Cancelación → cancelar PaymentIntent (reembolso automático)
```

El `PaymentIntent.id` se guarda en `Reserva.stripe_payment_intent` (campo único).

---

## Comisión de Plataforma

- SafeRent cobra una comisión almacenada en `Reserva.comision_plataforma` (Float, en €).
- Se calcula al crear la reserva: `precio_mes × días_reserva × tasa_comision`.
- La tasa de comisión es configuración de entorno, no hardcodeada.
- Al capturar: separar la comisión usando `transfer_data` de Stripe Connect o
  `application_fee_amount`.

---

## Stripe Connect

- Cada `PROPIETARIO` verificado tiene `Usuario.stripe_account_id` (cuenta Connect Express).
- Onboarding: `stripe.accountLinks.create({ type: 'account_onboarding' })`.
- Transferencias: usar `transfer_data.destination` en el PaymentIntent apuntando al
  `stripe_account_id` del propietario.
- Verificar que la cuenta Connect esté activa (`charges_enabled: true`) antes de crear
  una reserva para esa vivienda.

---

## Módulo NestJS: PaymentsModule

```
src/payments/
  payments.module.ts       # Importa AuthModule, StripeModule (si se crea)
  payments.controller.ts   # Endpoints REST + webhook endpoint
  payments.service.ts      # Lógica de negocio
  payments.dto.ts
  payments.service.spec.ts
```

### Endpoints clave

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/payments/intent` | `INQUILINO` | Crea PaymentIntent para una reserva |
| `POST` | `/payments/capture/:reservaId` | `ADMINISTRADOR` | Captura fondos retenidos |
| `POST` | `/payments/cancel/:reservaId` | `INQUILINO` o `ADMINISTRADOR` | Cancela y reembolsa |
| `POST` | `/payments/webhook` | Sin auth | Webhook Stripe (verificar firma) |
| `POST` | `/payments/connect/onboarding` | `PROPIETARIO` | Genera link de onboarding Connect |

---

## Webhook — Implementación Segura

```typescript
// payments.controller.ts
@Post('webhook')
@HttpCode(200)
async handleWebhook(
  @Headers('stripe-signature') sig: string,
  @Req() req: RawBodyRequest<Request>,  // Requiere rawBody: true en main.ts
) {
  const event = this.paymentsService.verifyWebhook(req.rawBody, sig);
  await this.paymentsService.processWebhookEvent(event);
}
```

```typescript
// payments.service.ts
verifyWebhook(payload: Buffer, signature: string): Stripe.Event {
  return this.stripe.webhooks.constructEvent(
    payload,
    signature,
    this.configService.get('STRIPE_WEBHOOK_SECRET'),
  );
}
```

**Importante:** `main.ts` debe tener `bodyParser: false` para la ruta del webhook y
configurar `rawBody: true` en `NestFactory.create`.

### Eventos a manejar
| Evento Stripe | Acción SafeRent |
|---|---|
| `payment_intent.amount_capturable_updated` | Reserva → `PAGO_RETENIDO` |
| `payment_intent.succeeded` | Reserva → `COMPLETADO`, liberar fondos |
| `payment_intent.payment_failed` | Reserva → `CANCELADO`, notificar inquilino |
| `payment_intent.canceled` | Reserva → `CANCELADO` |
| `account.updated` | Actualizar estado de cuenta Connect del propietario |

---

## Inicialización del Cliente Stripe

```typescript
// En payments.module.ts o un StripeModule dedicado
const stripe = new Stripe(configService.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});
```

---

## Guardrails Específicos

- Nunca loguear el `client_secret` del PaymentIntent.
- Idempotency keys: usar `reserva.id` como `idempotencyKey` en la creación del PI.
- Validar que `vivienda.verificada === true` antes de crear un PaymentIntent.
- Validar que el `PROPIETARIO` tenga `stripe_account_id` activo antes de aceptar pagos.
- Timeout: configurar webhooks con reintentos — responder siempre en < 30 s.
