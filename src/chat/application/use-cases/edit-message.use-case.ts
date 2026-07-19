import { Inject, Injectable } from '@nestjs/common';
import { Message } from '../../domain/entities/message.entity';
import {
  MESSAGE_REPOSITORY,
  IMessageRepository,
} from '../../domain/repositories/message.repository';
import {
  CannotEditDocumentMessageError,
  InvalidMessageContentError,
  MessageAlreadyDeletedError,
  MessageEditWindowExpiredError,
  MessageNotFoundError,
  NotMessageSenderError,
} from '../errors';

export interface EditMessageInput {
  messageId: string;
  requesterId: string;
  content: string;
}

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const MIN_CONTENT_LENGTH = 1;
const MAX_CONTENT_LENGTH = 4000;

/**
 * Solo aplica a mensajes de texto (typos/errores de dedo) — los documentos
 * no se "editan", se borran y se vuelven a mandar. Límite de 15 min desde
 * `createdAt`, más laxo que el de borrado porque corregir un error se nota
 * más tarde que darse cuenta de que no debiste mandar el mensaje.
 */
@Injectable()
export class EditMessageUseCase {
  constructor(
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
  ) {}

  async execute(input: EditMessageInput): Promise<Message> {
    const content = input.content?.trim() ?? '';
    if (
      content.length < MIN_CONTENT_LENGTH ||
      content.length > MAX_CONTENT_LENGTH
    ) {
      throw new InvalidMessageContentError();
    }

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
    if (message.type !== 'text') {
      throw new CannotEditDocumentMessageError();
    }

    const elapsedMs = Date.now() - message.createdAt.getTime();
    if (elapsedMs > EDIT_WINDOW_MS) {
      throw new MessageEditWindowExpiredError();
    }

    return this.messageRepository.updateContent(
      message.id,
      content,
      new Date(),
    );
  }
}
