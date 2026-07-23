# Plan: Límite de conversaciones del lessor free en el chat (→ 402)

## Contexto

Ya existe la regla del plan free para **publicar propiedades** (máx. 2, gate 402 vía `PremiumGuard`
en el backend `vivia`). Este plan implementa la contraparte en el **chat** (`WS-vivia`): un lessor
free solo puede sostener **2 conversaciones activas** con lessees.

Dato de infraestructura clave: **WS-vivia usa el mismo Postgres que vivia** (`DATABASE_URL=.../vivia`).
Las tablas del chat están en el schema `chat`; las suscripciones de vivia están en
`public.lessor_subscriptions` (`user_id`, `premium_until`) **en esa misma base**. Por eso el chat
resuelve el estado premium con una lectura de solo-lectura a esa tabla, sin salto HTTP.

### Regla de negocio (confirmada con el usuario)

- El cupo del lessor se consume **cuando el lessor responde** (envía su primer mensaje en una
  conversación), no cuando el lessee lo contacta.
- "Conversación activa de un lessor" = conversación donde **el lessor ya mandó al menos un mensaje**.
- Un lessor **free** puede tener máximo **2** conversaciones activas. Al intentar su **primer**
  mensaje en una **tercera** → **402**.
- Los **lessees nunca se bloquean**: pueden escribirle al lessor; este simplemente no podrá
  responder hasta hacerse Premium o liberar cupo.
- Los usuarios **premium** (`premium_until > now()`) no tienen límite.
- **Sin pre-check HTTP** (a diferencia de `GET /properties/posts`): la barrera va directo al envío
  del primer mensaje del lessor.

## Regla precisa de la barrera

Al enviar un mensaje (texto WS o documento HTTP), con `sender = S`, `conversation = C`:

1. Rol del emisor en `C`. Si `S` no es `ROLE_LESSOR` → **permitir** (los lessees nunca se bloquean).
2. `S` es el lessor:
   - Si el lessor ya mandó algún mensaje en `C` → **permitir** (ya contaba, no estrena cupo).
   - Si es premium → **permitir**.
   - Si `COUNT(DISTINCT conversation_id) FROM chat.messages WHERE sender_id = S` ≥ 2 → **402**.

## Cambios (todos en `WS-vivia`)

- `src/chat/application/errors.ts`: `ConversationLimitReachedError`.
- `src/chat/infrastructure/subscription/lessor-subscription.repository.ts` (interfaz + token) e
  `.impl.ts`: lectura read-only de `public.lessor_subscriptions` con la DataSource existente
  (fail-open ante error de BD). Premium = `premium_until > now()`.
- `src/chat/domain/repositories/message.repository.ts` (+impl TypeORM): métodos
  `countDistinctConversationsBySender` y `hasSenderMessagedInConversation`.
- `src/chat/application/services/conversation-limit.guard.ts`: `assertLessorCanRespond(conversation,
  senderId)` con la lógica de arriba; límite vía `CHAT_FREE_CONVERSATION_LIMIT` (default 2).
- `create-message.use-case.ts` y `create-document-message.use-case.ts`: llaman al guard tras validar
  participante y antes de crear el mensaje.
- `chat.controller.ts` (`mapDomainError`): `ConversationLimitReachedError` → 402
  (`HttpException` + `HttpStatus.PAYMENT_REQUIRED`).
- `protocol.ts` + `chat.gateway.ts`: `ErrorCodes.CONVERSATION_LIMIT_REACHED`; el evento WS `error`
  ahora puede llevar `code` además de `reason` (backward-compatible).
- `chat.module.ts`: providers del repo de suscripción y del guard.
- `.env.example`: `CHAT_FREE_CONVERSATION_LIMIT=2`.

## Verificación

1. `npm run build` y `npm run lint` sin errores; `npm test`.
2. Lessor free con 0–1 activas responde en una nueva → OK.
3. Lessor free con 2 activas manda su **primer** mensaje en una 3ª → 402 (HTTP) / evento `error` con
   `code: CONVERSATION_LIMIT_REACHED` (WS).
4. Lessor free responde en una de sus 2 conversaciones ya activas → OK.
5. Lessee escribe al lessor lleno → siempre OK.
6. Lessor premium → sin límite.
