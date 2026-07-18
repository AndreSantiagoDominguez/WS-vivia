export type MessageType = 'text' | 'document';

export interface MessageProps {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string | null;
  documentUrl: string | null;
  documentName: string | null;
  documentMimeType: string | null;
  documentSizeBytes: number | null;
  readAt: Date | null;
  deletedAt: Date | null;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mensaje individual dentro de una conversación. No conoce Postgres ni ws.
 * `content` es el texto del mensaje cuando `type === 'text'`, o un caption
 * opcional cuando `type === 'document'`. Los campos `document*` solo se
 * completan para mensajes de documento.
 *
 * `deletedAt` marca un borrado "con rastro" (entre 1 y 5 minutos después de
 * `createdAt`) — el contenido ya se limpió en el repositorio, este campo solo
 * indica al cliente que renderice el placeholder "mensaje eliminado". Un
 * borrado dentro del primer minuto no pasa por aquí: la fila se elimina por
 * completo (ver `DeleteMessageUseCase`).
 */
export class Message {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly type: MessageType;
  readonly content: string | null;
  readonly documentUrl: string | null;
  readonly documentName: string | null;
  readonly documentMimeType: string | null;
  readonly documentSizeBytes: number | null;
  readAt: Date | null;
  readonly deletedAt: Date | null;
  readonly editedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: MessageProps) {
    this.id = props.id;
    this.conversationId = props.conversationId;
    this.senderId = props.senderId;
    this.type = props.type;
    this.content = props.content;
    this.documentUrl = props.documentUrl;
    this.documentName = props.documentName;
    this.documentMimeType = props.documentMimeType;
    this.documentSizeBytes = props.documentSizeBytes;
    this.readAt = props.readAt;
    this.deletedAt = props.deletedAt;
    this.editedAt = props.editedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  get isRead(): boolean {
    return this.readAt !== null;
  }

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }
}
