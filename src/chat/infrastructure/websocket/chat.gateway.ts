/**
 * ============================================================================
 * Protocolo de mensajes del chat de Vivia (WebSocket puro, sin Socket.io)
 * ============================================================================
 *
 * No hay concepto nativo de "evento" como en Socket.io: cada mensaje es un
 * frame de texto WebSocket con JSON plano, siempre con este envoltorio en
 * ambas direcciones:
 *
 *   { "event": "nombreDelEvento", "payload": { ... } }
 *
 * Este es el contrato exacto que el cliente Flutter (web_socket_channel) debe
 * replicar del otro lado.
 *
 * Autenticación: el JWT viaja como header `Authorization: Bearer <token>` en
 * el handshake HTTP de la conexión (no como query param). Si falta o es
 * inválido, la conexión se cierra con el código 4001 inmediatamente después
 * de aceptar el handshake. Como fallback, para clientes que corren en un
 * navegador (que no puede fijar headers custom en un handshake de WS), se
 * acepta el mismo token viajando como `Sec-WebSocket-Protocol` — es el único
 * header de este handshake que un navegador sí puede controlar. Ver
 * `extractProtocolToken` en `ws-auth.util.ts`; el cliente Flutter real sigue
 * usando el header `Authorization`.
 *
 * Eventos que el CLIENTE puede mandar:
 *   - joinConversation  { conversationId: string }
 *   - newMessage        { conversationId: string, content: string }
 *   - typing            { conversationId: string }
 *   - markRead          { conversationId: string }
 *
 * Eventos que el SERVIDOR puede mandar de vuelta:
 *   - joined        { conversationId: string }
 *   - newMessage    { id, conversationId, senderId, type, content, documentUrl,
 *                      documentName, documentMimeType, documentSizeBytes, readAt, createdAt }
 *   - typing        { conversationId: string, userId: string }
 *   - messagesRead  { conversationId: string, userId: string }
 *   - error         { reason: string }
 *
 * `markRead` NO es una acción manual del usuario (no hay botón "marcar como
 * leído" en el cliente real) — el cliente lo manda automáticamente apenas
 * abre la pantalla de una conversación específica, justo después de recibir
 * `joined`. Así se marcan como leídos los mensajes pendientes de esa
 * conversación puntual; las demás conversaciones de la lista no se tocan
 * hasta que el usuario también entre a esas.
 * ============================================================================
 */
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IncomingMessage } from 'http';
import { RawData, Server } from 'ws';
import { CreateMessageUseCase } from '../../application/use-cases/create-message.use-case';
import { MarkMessagesReadUseCase } from '../../application/use-cases/mark-messages-read.use-case';
import {
  ConversationNotFoundError,
  InvalidMessageContentError,
  NotConversationParticipantError,
} from '../../application/errors';
import {
  CONVERSATION_REPOSITORY,
  IConversationRepository,
} from '../../domain/repositories/conversation.repository';
import { AuthenticatedWebSocket } from '../auth/authenticated-websocket';
import {
  JwtVerificationError,
  JwtVerificationService,
} from '../auth/jwt-verification.service';
import { extractBearerToken, extractProtocolToken } from '../auth/ws-auth.util';
import { ConnectionRegistryService } from './connection-registry.service';
import { JoinConversationDto } from './dtos/join-conversation.dto';
import { MarkReadDto } from './dtos/mark-read.dto';
import { NewMessageDto } from './dtos/new-message.dto';
import { TypingDto } from './dtos/typing.dto';
import {
  ClientEvents,
  ServerEvents,
  envelope,
  toNewMessagePayload,
} from './protocol';

const HEARTBEAT_INTERVAL_MS = 30_000;
/** Código de cierre no estándar (rango privado 4000-4999) para auth fallida en el handshake. */
const AUTH_FAILED_CLOSE_CODE = 4001;

function rawDataToUtf8(data: RawData): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}

/**
 * `handleProtocols` no forma parte del tipo `GatewayMetadata` de Nest, pero
 * `WsAdapter.create()` reenvía cualquier propiedad extra directo al
 * `ws.Server` de abajo (ver `node_modules/@nestjs/platform-ws`), que sí lo
 * soporta. Se define en una constante aparte — pasarlo como objeto literal
 * directo al decorador dispara el chequeo de "excess properties" de TS.
 * Le hace eco al navegador del subprotocolo que ofreció (el token) para que
 * acepte el handshake — ver `extractProtocolToken` en `ws-auth.util.ts`.
 */
const wsGatewayOptions = {
  handleProtocols: (protocols: Set<string>): string | false =>
    [...protocols][0] ?? false,
};

@Injectable()
@WebSocketGateway(wsGatewayOptions)
export class ChatGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(ChatGateway.name);
  private heartbeatInterval?: NodeJS.Timeout;

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly jwtVerificationService: JwtVerificationService,
    private readonly connectionRegistry: ConnectionRegistryService,
    private readonly createMessageUseCase: CreateMessageUseCase,
    private readonly markMessagesReadUseCase: MarkMessagesReadUseCase,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IConversationRepository,
  ) {}

  afterInit(): void {
    this.heartbeatInterval = setInterval(
      () => this.runHeartbeat(),
      HEARTBEAT_INTERVAL_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  async handleConnection(
    client: AuthenticatedWebSocket,
    request: IncomingMessage,
  ): Promise<void> {
    const token = extractBearerToken(request) ?? extractProtocolToken(request);
    if (!token) {
      client.close(AUTH_FAILED_CLOSE_CODE, 'Missing bearer token');
      return;
    }

    // `verify()` es async (consulta la identidad en la base), lo que abre una
    // ventana entre aceptar el handshake y quedar autenticado. Si el cliente
    // manda un mensaje apenas conecta (p. ej. un join inmediato), puede llegar
    // dentro de esa ventana — y `ws` no bufferea eventos 'message' sin listener,
    // así que se perdería en silencio. Por eso el listener se engancha ya
    // mismo, y lo que llegue antes de autenticar se encola para procesarlo
    // después.
    const pendingMessages: RawData[] = [];
    let authenticated = false;

    client.on('message', (data: RawData) => {
      if (!authenticated) {
        pendingMessages.push(data);
        return;
      }
      this.handleIncomingMessage(client, data).catch((error: unknown) =>
        this.logger.error(
          'Unhandled error processing WS message',
          error as Error,
        ),
      );
    });

    try {
      const { userId, role } = await this.jwtVerificationService.verify(token);
      client.userId = userId;
      client.role = role;
    } catch (error) {
      const reason =
        error instanceof JwtVerificationError ? error.message : 'Invalid token';
      client.close(AUTH_FAILED_CLOSE_CODE, reason);
      return;
    }

    client.isAlive = true;
    client.on('pong', () => {
      client.isAlive = true;
    });

    this.connectionRegistry.registerConnection(client);

    authenticated = true;
    for (const data of pendingMessages) {
      this.handleIncomingMessage(client, data).catch((error: unknown) =>
        this.logger.error(
          'Unhandled error processing WS message',
          error as Error,
        ),
      );
    }
  }

  handleDisconnect(client: AuthenticatedWebSocket): void {
    this.connectionRegistry.removeClient(client);
  }

  private async handleIncomingMessage(
    client: AuthenticatedWebSocket,
    data: RawData,
  ): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawDataToUtf8(data));
    } catch {
      this.sendError(client, 'Message must be valid JSON');
      return;
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { event?: unknown }).event !== 'string'
    ) {
      this.sendError(
        client,
        'Message must match the { event, payload } envelope',
      );
      return;
    }

    const { event, payload } = parsed as { event: string; payload: unknown };

    switch (event) {
      case ClientEvents.JOIN_CONVERSATION:
        await this.onJoinConversation(client, payload);
        break;
      case ClientEvents.NEW_MESSAGE:
        await this.onNewMessage(client, payload);
        break;
      case ClientEvents.TYPING:
        await this.onTyping(client, payload);
        break;
      case ClientEvents.MARK_READ:
        await this.onMarkRead(client, payload);
        break;
      default:
        this.sendError(client, `Unknown event: ${event}`);
    }
  }

  private async onJoinConversation(
    client: AuthenticatedWebSocket,
    rawPayload: unknown,
  ): Promise<void> {
    const dto = await this.validateOrReject(
      client,
      JoinConversationDto,
      rawPayload,
    );
    if (!dto) return;

    const conversation = await this.conversationRepository.findById(
      dto.conversationId,
    );
    if (!conversation || !conversation.hasParticipant(client.userId)) {
      this.sendError(client, 'Not a participant of this conversation');
      return;
    }

    this.connectionRegistry.addToConversation(dto.conversationId, client);
    this.send(client, ServerEvents.JOINED, {
      conversationId: dto.conversationId,
    });
  }

  private async onNewMessage(
    client: AuthenticatedWebSocket,
    rawPayload: unknown,
  ): Promise<void> {
    const dto = await this.validateOrReject(client, NewMessageDto, rawPayload);
    if (!dto) return;

    try {
      const message = await this.createMessageUseCase.execute({
        conversationId: dto.conversationId,
        senderId: client.userId,
        content: dto.content,
      });

      this.connectionRegistry.broadcastToConversation(
        dto.conversationId,
        envelope(ServerEvents.NEW_MESSAGE, toNewMessagePayload(message)),
      );
    } catch (error) {
      this.sendError(client, this.describeError(error));
    }
  }

  private async onTyping(
    client: AuthenticatedWebSocket,
    rawPayload: unknown,
  ): Promise<void> {
    const dto = await this.validateOrReject(client, TypingDto, rawPayload);
    if (!dto) return;

    // No se persiste nada; se excluye al remitente para que no le rebote a sí mismo.
    this.connectionRegistry.broadcastToConversation(
      dto.conversationId,
      envelope(ServerEvents.TYPING, {
        conversationId: dto.conversationId,
        userId: client.userId,
      }),
      client,
    );
  }

  private async onMarkRead(
    client: AuthenticatedWebSocket,
    rawPayload: unknown,
  ): Promise<void> {
    const dto = await this.validateOrReject(client, MarkReadDto, rawPayload);
    if (!dto) return;

    try {
      await this.markMessagesReadUseCase.execute({
        conversationId: dto.conversationId,
        readerId: client.userId,
      });

      this.connectionRegistry.broadcastToConversation(
        dto.conversationId,
        envelope(ServerEvents.MESSAGES_READ, {
          conversationId: dto.conversationId,
          userId: client.userId,
        }),
      );
    } catch (error) {
      this.sendError(client, this.describeError(error));
    }
  }

  private runHeartbeat(): void {
    for (const client of this.connectionRegistry.getAllClients()) {
      if (!client.isAlive) {
        client.terminate();
        this.connectionRegistry.removeClient(client);
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }

  private async validateOrReject<T extends object>(
    client: AuthenticatedWebSocket,
    dtoClass: new () => T,
    raw: unknown,
  ): Promise<T | null> {
    const instance = plainToInstance(dtoClass, raw ?? {});
    const errors = await validate(instance);
    if (errors.length > 0) {
      const reason = errors
        .map((error) => Object.values(error.constraints ?? {}).join(', '))
        .join('; ');
      this.sendError(client, `Invalid payload: ${reason}`);
      return null;
    }
    return instance;
  }

  private describeError(error: unknown): string {
    if (
      error instanceof ConversationNotFoundError ||
      error instanceof NotConversationParticipantError ||
      error instanceof InvalidMessageContentError
    ) {
      return error.message;
    }
    this.logger.error('Unexpected error handling WS event', error as Error);
    return 'Unexpected error';
  }

  private send<T>(
    client: AuthenticatedWebSocket,
    event: string,
    payload: T,
  ): void {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(envelope(event, payload)));
    }
  }

  private sendError(client: AuthenticatedWebSocket, reason: string): void {
    this.send(client, ServerEvents.ERROR, { reason });
  }
}
