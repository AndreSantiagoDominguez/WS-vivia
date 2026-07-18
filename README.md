# Vivia Chat Service

Servicio de mensajería en tiempo real de **Vivia**, una app inmobiliaria multiplataforma (Flutter). Es un microservicio **nuevo e independiente**, escrito en NestJS — no reemplaza ni toca el backend principal de Vivia (un monolito Spring Boot que sigue manejando usuarios, propiedades y autenticación). Este servicio solo se ocupa de conversaciones y mensajes.

## Por qué WebSocket puro y no Socket.io

El cliente real es la app Flutter, usando el paquete oficial [`web_socket_channel`](https://pub.dev/packages/web_socket_channel) — no una librería compatible con el protocolo propietario de Socket.io. Elegimos explícitamente frames de WebSocket estándar con JSON plano:

- El cliente Flutter no necesita ninguna dependencia extra del lado de socket.io.
- El servidor se puede probar con herramientas genéricas de WebSocket (`wscat`, o cualquier cliente WS crudo), sin depender de un cliente compatible con Socket.io.
- No hay overhead de un protocolo de framing propietario encima del WebSocket estándar.

La contrapartida: sin Socket.io no hay concepto nativo de "evento" ni de "rooms" — ambos se implementaron a mano (ver [Protocolo](#protocolo-de-websocket) y [`ConnectionRegistryService`](#salas-manuales-connectionregistryservice)).

## Arquitectura

Hexagonal / Clean Architecture, organizada **por feature** (un solo feature hoy: `chat`), con las capas de siempre dentro:

```
src/
  chat/
    domain/            → entidades puras (Conversation, Message) + interfaces de repositorio.
                          No importa nada de TypeORM, ws, ni Express.
    application/        → casos de uso (orquestan el dominio). Solo dependen de las
                          interfaces de domain/, nunca de una implementación concreta.
    infrastructure/     → todo lo que toca el mundo exterior:
      persistence/typeorm/  → entidades ORM + implementación real de los repositorios contra Postgres.
      websocket/             → el gateway de ws, el registro de conexiones, el protocolo.
      http/                  → el controller REST + DTOs.
      auth/                  → verificación de JWT, guard HTTP, identidad temporal.
      storage/               → subida de documentos a Cloudinary.
  health/                → health check, cross-cutting, no es parte del dominio del chat.
```

La regla de dependencia se respeta en un solo sentido: `domain` no sabe nada de nadie; `application` solo conoce las interfaces de `domain`; `infrastructure` es la única capa que sabe que existen Postgres, WebSocket, HTTP o Cloudinary. Los casos de uso reciben esas dependencias por inyección, vía los tokens definidos en `domain/repositories/*.ts`.

## Autenticación

El JWT lo emite el backend Spring Boot (`JwtProvider.java`) — este servicio nunca genera ni firma tokens, solo los verifica.

- **Algoritmo forzado explícitamente a HS512** (`jsonwebtoken`, opción `algorithms: ['HS512']`). El backend Java firma con `jjwt`, que elige HS512 automáticamente porque el secreto es largo, pero no lo declara explícito en el token — si no restringiéramos el algoritmo permitido en la verificación, `jsonwebtoken` aceptaría cualquier algoritmo simétrico compatible con el mismo secreto, lo cual es una superficie de ataque innecesaria.
- **Claims**: `sub` (email), `role` (`ROLE_LESSOR` / `ROLE_LESSEE`), `userId` (UUID, la identidad real y estable), `iat`, `exp`.
- El **`userId`** es el identificador que se usa en todo el sistema de chat — nunca el email, salvo en el mecanismo de abajo.

### Identidad temporal por email

En producción encontramos tokens reales de Spring Boot que no traían `userId` (un gap real del lado del login, no un caso hipotético). El diseño original decía "rechazar sin excepción" un token así — correcto como default, pero significa que ese usuario queda bloqueado del chat en su primer contacto.

Solución: si un token no trae `userId`, se acepta la conexión usando una **identidad temporal determinística derivada del email** (`deriveTemporaryUserId`, UUID v5 — mismo email, siempre el mismo UUID). El usuario puede chatear con normalidad mientras tanto. En cuanto llega, para ese mismo email, un token que **sí** trae `userId`, se dispara `ReconcileTemporaryIdentityUseCase`: migra todas las conversaciones y mensajes creados bajo la identidad temporal hacia la real (fusionando con una conversación real preexistente si ya había una entre las mismas dos personas), y desde ese momento el email siempre resuelve al `userId` real. El emparejamiento siempre es por `sub` (email) — nunca se inventa una identidad para un email que nunca vino acompañado de un `userId` real, así que la garantía original (nunca usar el email como identidad "de mentira") se mantiene: la temporal es solo un puente, siempre termina resolviendo a la identidad real de Spring Boot.

Tabla `chat.user_identities`: `email` (PK), `user_id`, `is_temporary`, `updated_at`.

## Protocolo de WebSocket

Sin concepto nativo de "evento": cada mensaje es un frame de texto con JSON plano, siempre con este envoltorio en ambas direcciones:

```json
{ "event": "nombreDelEvento", "payload": { ... } }
```

**Autenticación del handshake**: el JWT viaja como header `Authorization: Bearer <token>` — así es como se conecta el cliente Flutter real (`IOWebSocketChannel` sí puede mandar headers custom, a diferencia del WebSocket de navegador). Si falta o es inválido, la conexión se cierra con el código **4001** inmediatamente después de aceptar el handshake.

> El servidor también acepta el token viajando como `Sec-WebSocket-Protocol`, exclusivamente como fallback para el [cliente de prueba en el navegador](#cliente-de-prueba-manual) — un navegador no puede fijar headers custom en un handshake de WS, así que es el único header de ese handshake que sí puede controlar. Flutter nunca usa este camino.

### Eventos que el cliente puede mandar

| Evento | Payload | Notas |
|---|---|---|
| `joinConversation` | `{ conversationId }` | Verifica que el usuario sea participante antes de unirlo. |
| `newMessage` | `{ conversationId, content }` | Mensaje de texto (1–4000 caracteres). |
| `typing` | `{ conversationId }` | No persiste nada. |
| `markRead` | `{ conversationId }` | **No es un botón ni una acción manual del usuario** — el cliente lo manda automáticamente apenas abre la pantalla de esa conversación puntual (justo después de recibir `joined`). Las demás conversaciones de la lista no se tocan hasta que el usuario también entre a esas. |
| `deleteMessage` | `{ messageId }` | Solo el remitente puede borrar su propio mensaje, y solo dentro de la ventana de tiempo — ver [Borrar y editar mensajes](#borrar-y-editar-mensajes). |
| `editMessage` | `{ messageId, content }` | Solo el remitente, solo mensajes de texto, solo dentro de la ventana de tiempo. |

### Eventos que el servidor puede mandar

| Evento | Payload |
|---|---|
| `joined` | `{ conversationId }` |
| `newMessage` | `{ id, conversationId, senderId, type, content, documentUrl, documentName, documentMimeType, documentSizeBytes, readAt, deletedAt, editedAt, createdAt }` — mismo evento para mensajes de texto (`type: "text"`) y de documento (`type: "document"`). |
| `typing` | `{ conversationId, userId }` — nunca se le manda de vuelta a quien lo originó. |
| `messagesRead` | `{ conversationId, userId }` — `userId` es quien marcó como leído (así el otro lado sabe que *sus* mensajes fueron vistos). |
| `messageDeleted` | `{ conversationId, messageId, hardDeleted, message? }` — `hardDeleted: true` significa que el cliente debe quitar `messageId` de su UI sin dejar rastro; `hardDeleted: false` trae `message` con `deletedAt` puesto, para mostrar el placeholder "mensaje eliminado". |
| `messageEdited` | Mismo shape que `newMessage`, con `editedAt` puesto — el cliente debe mostrar "(editado)". |
| `error` | `{ reason }` |

### Borrar y editar mensajes

Reglas de negocio (no es el patrón casual de WhatsApp — acá hay negocios de por medio, así que el borrado deja rastro salvo que sea prácticamente instantáneo):

| Acción | Ventana | Efecto |
|---|---|---|
| Borrar | < 1 min desde `createdAt` | Se asume que nadie lo vio — se borra la fila completa, `messageDeleted` con `hardDeleted: true`. |
| Borrar | 1–5 min desde `createdAt` | Es probable que ya se haya leído — se conserva un placeholder (`messageDeleted` con `hardDeleted: false` y `message.deletedAt` puesto). |
| Borrar | > 5 min | Ya no se puede borrar. |
| Editar | ≤ 10 min desde `createdAt`, solo `type: "text"` | Actualiza `content` y marca `editedAt`. Los documentos no se editan, solo se borran. |

Solo el remitente puede borrar/editar su propio mensaje — cualquier otro intento (o fuera de ventana) responde con `error`.

### Borrar una conversación

`DELETE /chat/conversations/:id` (REST, no WebSocket) oculta la conversación **solo para quien la pide** — el otro participante conserva su copia intacta, mensajes incluidos. Si después llega un mensaje nuevo, la conversación reaparece sola en `GET /chat/conversations` para quien la había ocultado (igual que WhatsApp).

### Salas manuales (`ConnectionRegistryService`)

`ws` no tiene concepto de "rooms" como Socket.io, así que se implementó a mano en memoria: un `Map<conversationId, Set<cliente>>` para broadcast, y un `Map<userId, Set<cliente>>` para presencia (un usuario puede tener varios dispositivos conectados).

> **Limitación conocida**: esta implementación en memoria solo es correcta mientras el backend corra en una **única instancia**. Escalar horizontalmente a más de un proceso requeriría un mecanismo externo (p. ej. Redis pub/sub) para sincronizar conversaciones y presencia entre procesos — fuera del alcance actual.

### Heartbeat

Cada 30 segundos el servidor manda un `ping` nativo de WebSocket a cada cliente conectado; si no responde con `pong` antes del siguiente ciclo, se considera muerta y se limpia del registro. El cliente Flutter necesita su propia lógica de reconexión del lado de `web_socket_channel` — eso no es responsabilidad de este backend.

Los frames también van comprimidos (`permessage-deflate`, extensión estándar del protocolo WebSocket) — ayuda especialmente a clientes móviles en redes lentas.

## Documentos

Además de mensajes de texto, una conversación acepta el envío de documentos (PDF, Word, Excel — **no** fotos: moderación de contenido explícito queda fuera de este alcance por ahora).

- Se suben por REST (`POST /chat/conversations/:id/documents`, `multipart/form-data`), no por WebSocket — no tiene sentido mandar binarios por un protocolo de frames de texto JSON.
- El backend los sube a **Cloudinary** (`resource_type: raw`, carpeta `vivia-chat/documents`) y persiste el mensaje con la URL resultante.
- El mensaje se transmite por WebSocket a todos los conectados en esa conversación con el mismo evento `newMessage` que un mensaje de texto (`type: "document"`).
- Límite: 20MB. Tipos permitidos: PDF, `.doc`/`.docx`, `.xls`/`.xlsx`.
- La validación de tipo de archivo revisa el **número mágico real** del archivo (no el `Content-Type` que manda el cliente) — más seguro, pero exige que el tipo tenga una firma binaria detectable. Por eso no se admite texto plano: no tiene una firma real que verificar, y preferimos excluirlo antes que confiar ciegamente en lo que declara el cliente.

## Esquema de datos

Todo vive en el mismo Postgres que el resto de Vivia, en un schema separado `chat` (sin foreign keys reales hacia usuarios/propiedades, que viven en Spring Boot — solo se guardan UUID + snapshots de texto).

- **`chat.conversations`**: `id`, `participant_one_id`/`participant_two_id` (el menor de los dos UUID siempre en `_one`, para que el índice único `(participant_one_id, participant_two_id)` sea determinístico sin importar quién inició la conversación), roles, `property_id`/`property_title` (snapshot, sin FK), `last_message_at`, `hidden_for_participant_one_at`/`hidden_for_participant_two_at` (borrado por participante, ver [Borrar una conversación](#borrar-una-conversación)), timestamps.
- **`chat.messages`**: `id`, `conversation_id` (FK real, `ON DELETE CASCADE`), `sender_id`, `type` (`text` | `document`), `content` (texto o caption opcional), campos `document_*`, `read_at`, `deleted_at`, `edited_at`, timestamps.
- **`chat.user_identities`**: `email` (PK), `user_id`, `is_temporary`, `updated_at` — ver [Identidad temporal](#identidad-temporal-por-email).

## Endpoints REST

Todos (salvo `/health`) requieren `Authorization: Bearer <jwt>` y usan el mismo `JwtVerificationService` que el gateway de WebSocket.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/chat/conversations` | Lista las conversaciones del usuario autenticado. |
| `GET` | `/chat/conversations/:id/messages?before&limit` | Historial paginado (más reciente primero). |
| `POST` | `/chat/conversations` | Obtiene la conversación con otro usuario, creándola si no existe (`otherUserId`, `otherUserRole`, `propertyId?`, `propertyTitle?`). |
| `DELETE` | `/chat/conversations/:id` | Oculta la conversación solo para el usuario autenticado (`204`) — ver [Borrar una conversación](#borrar-una-conversación). |
| `POST` | `/chat/conversations/:id/documents` | Sube un documento (`multipart/form-data`, campo `file` + `caption` opcional). |
| `GET` | `/health` | Sin auth. Confirma que el proceso responde y que Postgres está alcanzable (`200` u `503`). Pensado para que el VPS/CI-CD decida si un deploy quedó sano. |

Documentación interactiva completa (tipos, formatos, "Authorize" con tu JWT) en `/api/docs` — cubre solo REST, el protocolo de WebSocket no se puede describir con OpenAPI y sigue documentado acá y en el comentario al inicio de `chat.gateway.ts`.

## Levantar el proyecto local

Requisitos: Node.js, Postgres corriendo en `localhost:5432` (o donde apunte tu `DATABASE_URL`), con el schema creado:

```bash
psql -U <usuario> -d <tu_db> -c "CREATE SCHEMA IF NOT EXISTS chat;"
```

Variables de entorno (`.env`, copiá `.env.example`):

```
PORT=3001
DATABASE_URL=postgres://usuario:password@localhost:5432/vivia
JWT_SECRET=<el mismo secreto que usa Spring Boot en jwt.secret>
CLOUDINARY_CLOUD_NAME=<de tu dashboard de Cloudinary>
CLOUDINARY_API_KEY=<de tu dashboard de Cloudinary>
CLOUDINARY_API_SECRET=<de tu dashboard de Cloudinary>
```

> Si `CLOUDINARY_*` no está configurado, el resto del backend arranca y funciona normal igual — la configuración de Cloudinary es perezosa (recién se exige en el primer intento real de subir un documento), a propósito para no acoplar todo el servicio a una feature que se puede configurar después.

```bash
npm install
npm run migration:run
npm run start:dev
```

`npm run migration:run` aplica el esquema versionado en `src/migrations/` (tablas, índices, foreign keys) — es un paso explícito, no automático: el server nunca corre migraciones solo en cada arranque (`migrationsRun: false` en `app.module.ts`), justo para que un deploy no pueda alterar el esquema de producción sin que alguien lo haya revisado primero.

### Migraciones

```bash
npm run migration:generate -- src/migrations/NombreDelCambio   # después de modificar una entidad
npm run migration:run                                          # aplica las migraciones pendientes
npm run migration:revert                                       # deshace la última
```

`migration:generate` compara las entidades (`*.orm-entity.ts`) contra el estado real de la base apuntada por `DATABASE_URL` y genera el SQL del diff — revisá siempre el archivo generado antes de commitear, TypeORM no es infalible con cambios de tipo de columna o renombres.

## Testing

```bash
npm test
```

Suite de Jest: casos de uso con repositorios mockeados, `JwtVerificationService` (token válido/expirado/mal firmado/sin `userId`/algoritmo incorrecto/identidad temporal + reconciliación), `ConnectionRegistryService`, `DocumentStorageService` (SDK de Cloudinary mockeado), y un test de integración del gateway completo con un cliente `ws` real (auth por header y por subprotocolo, join autorizado/no autorizado, envío y recepción de mensajes, reconciliación de identidad de punta a punta).

### Cliente de prueba manual

`test-client/index.html` — un único archivo HTML+JS autocontenido (sin build, sin dependencias), **no versionado** (ver `.gitignore`). Simula dos usuarios lado a lado conectados por WebSocket, para validar `joinConversation`/`newMessage`/`typing`/`markRead`/documentos a ojo, sin depender de `wscat` ni de la app Flutter real. Solo consume la API pública del backend — no es parte del servicio en sí.

## Deployment

- **CORS** solo se habilita cuando `NODE_ENV !== 'production'` (para el cliente de prueba y Swagger en local). En producción queda cerrado del todo — el único consumidor real es la app Flutter nativa, que no está sujeta a CORS de ninguna forma (esa restricción solo aplica a clientes que corren dentro de un navegador).
- `GET /health` para que el orquestador/CI-CD sepa si el deploy está sano antes de cortar tráfico a la versión anterior.
- El pipeline de deploy debe correr `npm run migration:run` como paso explícito antes de levantar la nueva versión — el proceso nunca las corre solo (`migrationsRun: false`).
