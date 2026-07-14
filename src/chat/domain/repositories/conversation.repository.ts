import { Conversation } from '../entities/conversation.entity';

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

export interface IConversationRepository {
  findById(id: string): Promise<Conversation | null>;

  /** `participantOneId` y `participantTwoId` ya deben venir ordenados (ver `Conversation.orderParticipants`). */
  findByParticipants(
    participantOneId: string,
    participantTwoId: string,
  ): Promise<Conversation | null>;

  create(data: NewConversationData): Promise<Conversation>;

  findAllForUser(userId: string): Promise<Conversation[]>;

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
