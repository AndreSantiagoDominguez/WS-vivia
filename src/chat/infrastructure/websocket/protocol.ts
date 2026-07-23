import { Message } from '../../domain/entities/message.entity';

/**
 * Envoltorio de mensajes del protocolo de chat sobre WebSocket puro. Ver el
 * comentario al inicio de `chat.gateway.ts` para el contrato completo.
 */
export interface WsEnvelope<TPayload = unknown> {
  event: string;
  payload: TPayload;
}

export const ClientEvents = {
  JOIN_CONVERSATION: 'joinConversation',
  NEW_MESSAGE: 'newMessage',
  TYPING: 'typing',
  MARK_READ: 'markRead',
  DELETE_MESSAGE: 'deleteMessage',
  EDIT_MESSAGE: 'editMessage',
} as const;

export const ServerEvents = {
  JOINED: 'joined',
  NEW_MESSAGE: 'newMessage',
  TYPING: 'typing',
  MESSAGES_READ: 'messagesRead',
  MESSAGE_DELETED: 'messageDeleted',
  MESSAGE_EDITED: 'messageEdited',
  ERROR: 'error',
} as const;

/**
 * Códigos legibles por máquina para el payload de `ServerEvents.ERROR`. El
 * móvil los usa para distinguir un error accionable (p. ej. mostrar la pantalla
 * de suscripción) de un fallo genérico, sin parsear el texto de `reason`.
 */
export const ErrorCodes = {
  CONVERSATION_LIMIT_REACHED: 'CONVERSATION_LIMIT_REACHED',
} as const;

export function envelope<TPayload>(
  event: string,
  payload: TPayload,
): WsEnvelope<TPayload> {
  return { event, payload };
}

/**
 * Forma compartida del payload de `newMessage`, usada tanto por
 * `ChatGateway.onNewMessage` (mensajes de texto, vía WS) como por el
 * endpoint REST de subida de documentos — un solo lugar define la forma del
 * evento sin importar por dónde se originó el mensaje.
 */
export function toNewMessagePayload(message: Message) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    type: message.type,
    content: message.content,
    documentUrl: message.documentUrl,
    documentName: message.documentName,
    documentMimeType: message.documentMimeType,
    documentSizeBytes: message.documentSizeBytes,
    readAt: message.readAt,
    deletedAt: message.deletedAt,
    editedAt: message.editedAt,
    createdAt: message.createdAt,
  };
}
