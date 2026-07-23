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

  findById(id: string): Promise<Message | null>;

  /** Historial paginado, más reciente primero. */
  findByConversationId(
    conversationId: string,
    options: ListMessagesOptions,
  ): Promise<Message[]>;

  /** Borrado sin rastro (< 1 min de creado) — elimina la fila por completo. */
  hardDelete(id: string): Promise<void>;

  /**
   * Borrado "con rastro" (1-5 min de creado): limpia el contenido/documento
   * y marca `deletedAt`, pero conserva la fila para que el cliente pueda
   * mostrar el placeholder "mensaje eliminado".
   */
  softDelete(id: string, deletedAt: Date): Promise<Message>;

  /** Edita el texto de un mensaje (solo `type === 'text'`) y marca `editedAt`. */
  updateContent(id: string, content: string, editedAt: Date): Promise<Message>;

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

  /**
   * Cuántas conversaciones distintas tienen al menos un mensaje enviado por
   * `senderId`. Es el conteo de "conversaciones activas" de un lessor para el
   * límite del plan free (ver `ConversationLimitGuard`).
   */
  countDistinctConversationsBySender(senderId: string): Promise<number>;

  /** `true` si `senderId` ya envió al menos un mensaje en `conversationId`. */
  hasSenderMessagedInConversation(
    conversationId: string,
    senderId: string,
  ): Promise<boolean>;
}
