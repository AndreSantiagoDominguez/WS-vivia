import { Message, MessageType } from '../entities/message.entity';

/** Token de inyección de dependencias — la interfaz no puede usarse como valor en Nest. */
export const MESSAGE_REPOSITORY = Symbol('MESSAGE_REPOSITORY');

export interface NewMessageData {
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string | null;
  documentUrl?: string | null;
  documentName?: string | null;
  documentMimeType?: string | null;
  documentSizeBytes?: number | null;
}

export interface ListMessagesOptions {
  before?: Date;
  limit: number;
}

export interface IMessageRepository {
  create(data: NewMessageData): Promise<Message>;

  /** Historial paginado, más reciente primero. */
  findByConversationId(
    conversationId: string,
    options: ListMessagesOptions,
  ): Promise<Message[]>;

  /**
   * Marca como leídos todos los mensajes de `conversationId` que NO fueron
   * enviados por `readerUserId` y que todavía no tienen `readAt`.
   * Devuelve la cantidad de mensajes actualizados.
   */
  markAsReadForRecipient(
    conversationId: string,
    readerUserId: string,
  ): Promise<number>;

  /** Mueve todos los mensajes de una conversación a otra. Usado al fusionar una conversación temporal con una ya existente durante la reconciliación de identidad. */
  reassignConversation(
    oldConversationId: string,
    newConversationId: string,
  ): Promise<void>;

  /** Reasigna el remitente de todos los mensajes de `oldUserId` a `newUserId`. */
  reassignSender(oldUserId: string, newUserId: string): Promise<void>;
}
