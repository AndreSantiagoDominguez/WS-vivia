import { Inject, Injectable } from '@nestjs/common';
import { Message } from '../../domain/entities/message.entity';
import {
  MESSAGE_REPOSITORY,
  IMessageRepository,
} from '../../domain/repositories/message.repository';
import {
  MessageAlreadyDeletedError,
  MessageDeleteWindowExpiredError,
  MessageNotFoundError,
  NotMessageSenderError,
} from '../errors';

export interface DeleteMessageInput {
  messageId: string;
  requesterId: string;
}

export type DeleteMessageResult =
  | { hardDeleted: true; conversationId: string; messageId: string }
  | { hardDeleted: false; message: Message };

const NO_TRACE_WINDOW_MS = 60 * 1000;
const DELETE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Reglas de borrado de mensajes (negociado con el producto, no es el patrón
 * casual de WhatsApp — acá hay negocios de por medio):
 *   - < 1 min desde `createdAt`: se asume que nadie lo vio, se borra la fila
 *     completa sin dejar rastro.
 *   - 1-5 min: es probable que el otro ya lo haya leído, así que se conserva
 *     un placeholder ("mensaje eliminado") en vez de desaparecerlo en silencio.
 *   - > 5 min: ya no se puede borrar.
 */
@Injectable()
export class DeleteMessageUseCase {
  constructor(
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
  ) {}

  async execute(input: DeleteMessageInput): Promise<DeleteMessageResult> {
    const message = await this.messageRepository.findById(input.messageId);
    if (!message) {
      throw new MessageNotFoundError(input.messageId);
    }
    if (message.senderId !== input.requesterId) {
      throw new NotMessageSenderError();
    }
    if (message.isDeleted) {
      throw new MessageAlreadyDeletedError();
    }

    const elapsedMs = Date.now() - message.createdAt.getTime();
    if (elapsedMs > DELETE_WINDOW_MS) {
      throw new MessageDeleteWindowExpiredError();
    }

    if (elapsedMs <= NO_TRACE_WINDOW_MS) {
      await this.messageRepository.hardDelete(message.id);
      return {
        hardDeleted: true,
        conversationId: message.conversationId,
        messageId: message.id,
      };
    }

    const updated = await this.messageRepository.softDelete(
      message.id,
      new Date(),
    );
    return { hardDeleted: false, message: updated };
  }
}
