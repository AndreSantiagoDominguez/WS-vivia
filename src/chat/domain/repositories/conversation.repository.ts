import { Conversation } from '../entities/conversation.entity';
import { MessageType } from '../entities/message.entity';

/** Token de inyección de dependencias — la interfaz no puede usarse como valor en Nest. */
export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY');

export interface NewConversationData {
  participantOneId: string;
  participantOneRole: string;
  participantTwoId: string;
  participantTwoRole: string;
  propertyId: string | null;
  propertyTitle: string | null;
}

/**
 * Proyección de una conversación para la lista (`GET /conversations`) — no es
 * un valor persistido: `lastMessageContent`/`lastMessageType` se calculan al
 * vuelo contra el mensaje más reciente real (así reflejan automáticamente si
 * ese mensaje se editó o se borró, sin tener que mantener una copia
 * desnormalizada sincronizada en cada mutación). `unreadCount` es relativo a
 * quien pide la lista, nunca un valor propio de la conversación.
 */
export interface ConversationSummary {
  conversation: Conversation;
  lastMessageContent: string | null;
  lastMessageType: MessageType | null;
  unreadCount: number;
}

export interface IConversationRepository {
  findById(id: string): Promise<Conversation | null>;

  /** `participantOneId` y `participantTwoId` ya deben venir ordenados (ver `Conversation.orderParticipants`). */
  findByParticipants(
    participantOneId: string,
    participantTwoId: string,
  ): Promise<Conversation | null>;

  create(data: NewConversationData): Promise<Conversation>;

  /**
   * Conversaciones visibles para `userId`: excluye las que ese participante
   * ocultó (ver `hideForParticipant`), salvo que haya actividad nueva desde
   * que las ocultó — en ese caso reaparecen solas.
   */
  findAllForUser(userId: string): Promise<Conversation[]>;

  /**
   * Igual que `findAllForUser`, pero para la pantalla de lista: agrega el
   * preview del último mensaje real y el conteo de no leídos de `userId`.
   */
  findConversationSummariesForUser(
    userId: string,
  ): Promise<ConversationSummary[]>;

  /**
   * "Borra" la conversación solo para `userId` (soft, por participante) —
   * el otro participante no se entera ni pierde su copia. Si más adelante
   * hay un mensaje nuevo, vuelve a aparecer en `findAllForUser` para `userId`.
   */
  hideForParticipant(conversationId: string, userId: string): Promise<void>;

  updateLastMessageAt(
    conversationId: string,
    lastMessageAt: Date,
  ): Promise<void>;

  /**
   * Sobreescribe los dos participantes con un par ya ordenado (ver
   * `Conversation.orderParticipants`). Usado por
   * `ReconcileTemporaryIdentityUseCase` para migrar una conversación de una
   * identidad temporal a la real sin romper el invariante de orden que
   * depende `findByParticipants`.
   */
  reassignParticipants(
    conversationId: string,
    participantOneId: string,
    participantOneRole: string,
    participantTwoId: string,
    participantTwoRole: string,
  ): Promise<void>;

  delete(conversationId: string): Promise<void>;
}
