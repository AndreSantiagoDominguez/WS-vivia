import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { WsAdapter } from '@nestjs/platform-ws';
import * as jwt from 'jsonwebtoken';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { WebSocket } from 'ws';
import { CreateMessageUseCase } from '../../application/use-cases/create-message.use-case';
import { DeleteMessageUseCase } from '../../application/use-cases/delete-message.use-case';
import { EditMessageUseCase } from '../../application/use-cases/edit-message.use-case';
import { MarkMessagesReadUseCase } from '../../application/use-cases/mark-messages-read.use-case';
import { ReconcileTemporaryIdentityUseCase } from '../../application/use-cases/reconcile-temporary-identity.use-case';
import { Conversation } from '../../domain/entities/conversation.entity';
import { Message } from '../../domain/entities/message.entity';
import {
  CONVERSATION_REPOSITORY,
  ConversationSummary,
  IConversationRepository,
  NewConversationData,
} from '../../domain/repositories/conversation.repository';
import {
  IMessageRepository,
  MESSAGE_REPOSITORY,
  NewMessageData,
} from '../../domain/repositories/message.repository';
import { deriveTemporaryUserId } from '../auth/identity/temporary-identity.util';
import {
  IUserIdentityRepository,
  USER_IDENTITY_REPOSITORY,
  UserIdentityRecord,
} from '../auth/identity/user-identity.repository';
import { JwtVerificationService } from '../auth/jwt-verification.service';
import { ChatGateway } from './chat.gateway';
import { ConnectionRegistryService } from './connection-registry.service';

const JWT_SECRET =
  'integration-test-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const PARTICIPANT_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_PARTICIPANT_ID = '22222222-2222-2222-2222-222222222222';
const OUTSIDER_ID = '33333333-3333-3333-3333-333333333333';
const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';

class InMemoryConversationRepository implements IConversationRepository {
  private readonly conversations = new Map<string, Conversation>();

  seed(conversation: Conversation): void {
    this.conversations.set(conversation.id, conversation);
  }

  findById(id: string): Promise<Conversation | null> {
    return Promise.resolve(this.conversations.get(id) ?? null);
  }

  findByParticipants(): Promise<Conversation | null> {
    return Promise.resolve(null);
  }

  create(data: NewConversationData): Promise<Conversation> {
    const conversation = new Conversation({
      id: 'generated',
      ...data,
      lastMessageAt: null,
      hiddenForParticipantOneAt: null,
      hiddenForParticipantTwoAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    this.conversations.set(conversation.id, conversation);
    return Promise.resolve(conversation);
  }

  findAllForUser(userId: string): Promise<Conversation[]> {
    return Promise.resolve(
      [...this.conversations.values()].filter((conversation) =>
        conversation.hasParticipant(userId),
      ),
    );
  }

  findConversationSummariesForUser(
    userId: string,
  ): Promise<ConversationSummary[]> {
    return this.findAllForUser(userId).then((conversations) =>
      conversations.map((conversation) => ({
        conversation,
        lastMessageContent: null,
        lastMessageType: null,
        unreadCount: 0,
        participantOneName: null,
        participantOnePhotoUrl: null,
        participantTwoName: null,
        participantTwoPhotoUrl: null,
      })),
    );
  }

  updateLastMessageAt(
    conversationId: string,
    lastMessageAt: Date,
  ): Promise<void> {
    const conversation = this.conversations.get(conversationId);
    if (conversation) conversation.lastMessageAt = lastMessageAt;
    return Promise.resolve();
  }

  reassignParticipants(
    conversationId: string,
    participantOneId: string,
    participantOneRole: string,
    participantTwoId: string,
    participantTwoRole: string,
  ): Promise<void> {
    const existing = this.conversations.get(conversationId);
    if (!existing) return Promise.resolve();
    this.conversations.set(
      conversationId,
      new Conversation({
        ...existing,
        participantOneId,
        participantOneRole,
        participantTwoId,
        participantTwoRole,
      }),
    );
    return Promise.resolve();
  }

  delete(conversationId: string): Promise<void> {
    this.conversations.delete(conversationId);
    return Promise.resolve();
  }

  hideForParticipant(conversationId: string, userId: string): Promise<void> {
    const existing = this.conversations.get(conversationId);
    if (!existing) return Promise.resolve();
    const isParticipantOne = existing.participantOneId === userId;
    this.conversations.set(
      conversationId,
      new Conversation({
        ...existing,
        hiddenForParticipantOneAt: isParticipantOne
          ? new Date()
          : existing.hiddenForParticipantOneAt,
        hiddenForParticipantTwoAt: !isParticipantOne
          ? new Date()
          : existing.hiddenForParticipantTwoAt,
      }),
    );
    return Promise.resolve();
  }
}

class InMemoryMessageRepository implements IMessageRepository {
  private readonly messages = new Map<string, Message>();

  create(data: NewMessageData): Promise<Message> {
    const message = new Message({
      id: `msg-${this.messages.size}-${Date.now()}`,
      conversationId: data.conversationId,
      senderId: data.senderId,
      type: data.type,
      content: data.content,
      documentUrl: data.documentUrl ?? null,
      documentName: data.documentName ?? null,
      documentMimeType: data.documentMimeType ?? null,
      documentSizeBytes: data.documentSizeBytes ?? null,
      readAt: null,
      deletedAt: null,
      editedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    this.messages.set(message.id, message);
    return Promise.resolve(message);
  }

  findById(id: string): Promise<Message | null> {
    return Promise.resolve(this.messages.get(id) ?? null);
  }

  hardDelete(id: string): Promise<void> {
    this.messages.delete(id);
    return Promise.resolve();
  }

  softDelete(id: string, deletedAt: Date): Promise<Message> {
    const existing = this.messages.get(id);
    if (!existing) throw new Error(`Message ${id} not found`);
    const updated = new Message({
      ...existing,
      content: null,
      documentUrl: null,
      documentName: null,
      documentMimeType: null,
      documentSizeBytes: null,
      deletedAt,
    });
    this.messages.set(id, updated);
    return Promise.resolve(updated);
  }

  updateContent(id: string, content: string, editedAt: Date): Promise<Message> {
    const existing = this.messages.get(id);
    if (!existing) throw new Error(`Message ${id} not found`);
    const updated = new Message({ ...existing, content, editedAt });
    this.messages.set(id, updated);
    return Promise.resolve(updated);
  }

  findByConversationId(
    conversationId: string,
    options: { before?: Date; limit: number },
  ): Promise<Message[]> {
    const found = [...this.messages.values()]
      .filter((message) => message.conversationId === conversationId)
      .filter(
        (message) => !options.before || message.createdAt < options.before,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, options.limit);
    return Promise.resolve(found);
  }

  markAsReadForRecipient(): Promise<number> {
    return Promise.resolve(0);
  }

  reassignConversation(
    oldConversationId: string,
    newConversationId: string,
  ): Promise<void> {
    for (const message of this.messages.values()) {
      if (message.conversationId === oldConversationId) {
        this.messages.set(
          message.id,
          new Message({ ...message, conversationId: newConversationId }),
        );
      }
    }
    return Promise.resolve();
  }

  reassignSender(oldUserId: string, newUserId: string): Promise<void> {
    for (const message of this.messages.values()) {
      if (message.senderId === oldUserId) {
        this.messages.set(
          message.id,
          new Message({ ...message, senderId: newUserId }),
        );
      }
    }
    return Promise.resolve();
  }
}

class InMemoryUserIdentityRepository implements IUserIdentityRepository {
  private readonly records = new Map<string, UserIdentityRecord>();

  findByEmail(email: string): Promise<UserIdentityRecord | null> {
    return Promise.resolve(this.records.get(email) ?? null);
  }

  createTemporary(email: string): Promise<string> {
    const userId = deriveTemporaryUserId(email);
    this.records.set(email, { userId, isTemporary: true });
    return Promise.resolve(userId);
  }

  markResolved(email: string, realUserId: string): Promise<void> {
    this.records.set(email, { userId: realUserId, isTemporary: false });
    return Promise.resolve();
  }
}

function signToken(email: string, userId?: string): string {
  const payload: Record<string, string> = { sub: email, role: 'ROLE_LESSEE' };
  if (userId) payload.userId = userId;
  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS512', expiresIn: '1h' });
}

function connectClient(port: number, token?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    client.once('open', () => resolve(client));
    client.once('error', reject);
    client.once('close', (code) =>
      reject(new Error(`Connection closed before opening: ${code}`)),
    );
  });
}

/** Simula al cliente de navegador: manda el token como subprotocolo en vez de header. */
function connectClientViaProtocol(
  port: number,
  token: string,
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://127.0.0.1:${port}`, [token]);
    client.once('open', () => resolve(client));
    client.once('error', reject);
    client.once('close', (code) =>
      reject(new Error(`Connection closed before opening: ${code}`)),
    );
  });
}

interface TestEnvelope {
  event: string;
  payload: Record<string, unknown>;
}

function nextMessage(client: WebSocket): Promise<TestEnvelope> {
  return new Promise((resolve, reject) => {
    client.once('message', (data: Buffer) => {
      try {
        resolve(JSON.parse(data.toString()) as TestEnvelope);
      } catch (error) {
        reject(error as Error);
      }
    });
  });
}

function waitForClose(client: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    client.once('close', (code) => resolve(code));
  });
}

describe('ChatGateway (integration, real ws client)', () => {
  let app: INestApplication;
  let port: number;
  let conversationRepository: InMemoryConversationRepository;
  let messageRepository: InMemoryMessageRepository;

  beforeAll(async () => {
    conversationRepository = new InMemoryConversationRepository();
    conversationRepository.seed(
      new Conversation({
        id: CONVERSATION_ID,
        participantOneId: PARTICIPANT_ID,
        participantOneRole: 'ROLE_LESSEE',
        participantTwoId: OTHER_PARTICIPANT_ID,
        participantTwoRole: 'ROLE_LESSOR',
        propertyId: null,
        propertyTitle: null,
        lastMessageAt: null,
        hiddenForParticipantOneAt: null,
        hiddenForParticipantTwoAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    messageRepository = new InMemoryMessageRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatGateway,
        ConnectionRegistryService,
        JwtVerificationService,
        { provide: ConfigService, useValue: { get: () => JWT_SECRET } },
        CreateMessageUseCase,
        MarkMessagesReadUseCase,
        DeleteMessageUseCase,
        EditMessageUseCase,
        ReconcileTemporaryIdentityUseCase,
        { provide: CONVERSATION_REPOSITORY, useValue: conversationRepository },
        { provide: MESSAGE_REPOSITORY, useValue: messageRepository },
        {
          provide: USER_IDENTITY_REPOSITORY,
          useClass: InMemoryUserIdentityRepository,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.listen(0);
    const httpServer = app.getHttpServer() as Server;
    port = (httpServer.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await app.close();
  });

  it('closes the connection with 4001 when no bearer token is sent', async () => {
    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    client.on('error', () => {
      // El servidor cierra la conexión sin bearer token; un ECONNRESET aquí es esperado.
    });

    const closeCode = await waitForClose(client);

    expect(closeCode).toBe(4001);
  });

  it('rejects joinConversation for a user who is not a participant', async () => {
    const client = await connectClient(
      port,
      signToken(`${OUTSIDER_ID}@vivia.com`, OUTSIDER_ID),
    );
    client.send(
      JSON.stringify({
        event: 'joinConversation',
        payload: { conversationId: CONVERSATION_ID },
      }),
    );

    const response = await nextMessage(client);

    expect(response.event).toBe('error');
    client.close();
  });

  it('allows joinConversation for an actual participant and confirms with "joined"', async () => {
    const client = await connectClient(
      port,
      signToken(`${PARTICIPANT_ID}@vivia.com`, PARTICIPANT_ID),
    );
    client.send(
      JSON.stringify({
        event: 'joinConversation',
        payload: { conversationId: CONVERSATION_ID },
      }),
    );

    const response = await nextMessage(client);

    expect(response).toEqual({
      event: 'joined',
      payload: { conversationId: CONVERSATION_ID },
    });
    client.close();
  });

  it('broadcasts newMessage back to the sender after joining', async () => {
    const client = await connectClient(
      port,
      signToken(`${PARTICIPANT_ID}@vivia.com`, PARTICIPANT_ID),
    );
    client.send(
      JSON.stringify({
        event: 'joinConversation',
        payload: { conversationId: CONVERSATION_ID },
      }),
    );
    await nextMessage(client);

    client.send(
      JSON.stringify({
        event: 'newMessage',
        payload: {
          conversationId: CONVERSATION_ID,
          content: 'hola desde el test',
        },
      }),
    );
    const response = await nextMessage(client);

    expect(response.event).toBe('newMessage');
    expect(response.payload.content).toBe('hola desde el test');
    expect(response.payload.senderId).toBe(PARTICIPANT_ID);
    client.close();
  });

  it('delivers newMessage exactly once to the sender and exactly once to the other participant (no self-echo duplication)', async () => {
    const sender = await connectClient(
      port,
      signToken(`${PARTICIPANT_ID}@vivia.com`, PARTICIPANT_ID),
    );
    const other = await connectClient(
      port,
      signToken(`${OTHER_PARTICIPANT_ID}@vivia.com`, OTHER_PARTICIPANT_ID),
    );

    sender.send(
      JSON.stringify({
        event: 'joinConversation',
        payload: { conversationId: CONVERSATION_ID },
      }),
    );
    other.send(
      JSON.stringify({
        event: 'joinConversation',
        payload: { conversationId: CONVERSATION_ID },
      }),
    );
    await nextMessage(sender);
    await nextMessage(other);

    const senderMessages: TestEnvelope[] = [];
    const otherMessages: TestEnvelope[] = [];
    sender.on('message', (data: Buffer) =>
      senderMessages.push(JSON.parse(data.toString()) as TestEnvelope),
    );
    other.on('message', (data: Buffer) =>
      otherMessages.push(JSON.parse(data.toString()) as TestEnvelope),
    );

    sender.send(
      JSON.stringify({
        event: 'newMessage',
        payload: {
          conversationId: CONVERSATION_ID,
          content: 'no debe duplicarse',
        },
      }),
    );

    // Espera a que ambos lados hayan tenido oportunidad de recibir (o no).
    await new Promise((resolve) => setTimeout(resolve, 300));

    const senderNewMessages = senderMessages.filter(
      (m) => m.event === 'newMessage',
    );
    const otherNewMessages = otherMessages.filter(
      (m) => m.event === 'newMessage',
    );

    expect(senderNewMessages).toHaveLength(1);
    expect(otherNewMessages).toHaveLength(1);

    sender.close();
    other.close();
  });

  it('authenticates via Sec-WebSocket-Protocol just like via the Authorization header', async () => {
    const client = await connectClientViaProtocol(
      port,
      signToken(`${PARTICIPANT_ID}@vivia.com`, PARTICIPANT_ID),
    );
    client.send(
      JSON.stringify({
        event: 'joinConversation',
        payload: { conversationId: CONVERSATION_ID },
      }),
    );

    const response = await nextMessage(client);

    expect(response).toEqual({
      event: 'joined',
      payload: { conversationId: CONVERSATION_ID },
    });
    client.close();
  });

  it('accepts a token without userId using a temporary identity, then reconciles it once a complete token arrives', async () => {
    const email = 'temporal@vivia.com';
    const tempUserId = deriveTemporaryUserId(email);
    const realUserId = '55555555-5555-5555-5555-555555555555';
    const tempConversationId = '66666666-6666-4666-8666-666666666666';

    const ordered = Conversation.orderParticipants(
      { userId: tempUserId, role: 'ROLE_LESSEE' },
      { userId: OTHER_PARTICIPANT_ID, role: 'ROLE_LESSOR' },
    );
    conversationRepository.seed(
      new Conversation({
        id: tempConversationId,
        ...ordered,
        propertyId: null,
        propertyTitle: null,
        lastMessageAt: null,
        hiddenForParticipantOneAt: null,
        hiddenForParticipantTwoAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const tempClient = await connectClient(port, signToken(email));
    tempClient.send(
      JSON.stringify({
        event: 'joinConversation',
        payload: { conversationId: tempConversationId },
      }),
    );
    await nextMessage(tempClient);
    tempClient.send(
      JSON.stringify({
        event: 'newMessage',
        payload: {
          conversationId: tempConversationId,
          content: 'hola desde la identidad temporal',
        },
      }),
    );
    await nextMessage(tempClient);
    tempClient.close();

    // Llega un token completo para el mismo email: dispara la reconciliación.
    // `handleConnection` solo empieza a escuchar mensajes después de que
    // `verify()` (y por lo tanto la reconciliación) termina, así que esperar
    // la respuesta de este `joinConversation` ya garantiza que corrió.
    const realClient = await connectClient(port, signToken(email, realUserId));
    realClient.send(
      JSON.stringify({
        event: 'joinConversation',
        payload: { conversationId: tempConversationId },
      }),
    );
    const joinResponse = await nextMessage(realClient);
    expect(joinResponse.event).toBe('joined');
    realClient.close();

    const migratedConversation =
      await conversationRepository.findById(tempConversationId);
    expect(migratedConversation?.hasParticipant(realUserId)).toBe(true);
    expect(migratedConversation?.hasParticipant(tempUserId)).toBe(false);

    const messages = await messageRepository.findByConversationId(
      tempConversationId,
      {
        limit: 10,
      },
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].senderId).toBe(realUserId);
  });
});
