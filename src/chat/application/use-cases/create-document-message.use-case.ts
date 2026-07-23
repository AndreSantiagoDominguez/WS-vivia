import { Inject, Injectable } from '@nestjs/common';
import { Message } from '../../domain/entities/message.entity';
import {
  CONVERSATION_REPOSITORY,
  IConversationRepository,
} from '../../domain/repositories/conversation.repository';
import {
  IMessageRepository,
  MESSAGE_REPOSITORY,
} from '../../domain/repositories/message.repository';
import { ConversationLimitGuard } from '../services/conversation-limit.guard';
import {
  ConversationNotFoundError,
  InvalidCaptionError,
  NotConversationParticipantError,
} from '../errors';

export interface CreateDocumentMessageInput {
  conversationId: string;
  senderId: string;
  caption: string | null;
  documentUrl: string;
  documentName: string;
  documentMimeType: string;
  documentSizeBytes: number;
}

const MAX_CAPTION_LENGTH = 4000;

/**
 * Persiste un mensaje de documento. El archivo ya debe estar subido — este
 * use case no sabe nada de Cloudinary ni de ningún proveedor de storage, solo
 * recibe la referencia final (ver `DocumentStorageService`, invocado desde
 * `ChatController` antes de llamar acá).
 */
@Injectable()
export class CreateDocumentMessageUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IConversationRepository,
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
    private readonly conversationLimitGuard: ConversationLimitGuard,
  ) {}

  async execute(input: CreateDocumentMessageInput): Promise<Message> {
    const caption = input.caption?.trim() || null;
    if (caption && caption.length > MAX_CAPTION_LENGTH) {
      throw new InvalidCaptionError();
    }

    const conversation = await this.conversationRepository.findById(
      input.conversationId,
    );
    if (!conversation) {
      throw new ConversationNotFoundError(input.conversationId);
    }
    if (!conversation.hasParticipant(input.senderId)) {
      throw new NotConversationParticipantError(
        input.senderId,
        input.conversationId,
      );
    }

    await this.conversationLimitGuard.assertLessorCanRespond(
      conversation,
      input.senderId,
    );

    const message = await this.messageRepository.create({
      conversationId: input.conversationId,
      senderId: input.senderId,
      type: 'document',
      content: caption,
      documentUrl: input.documentUrl,
      documentName: input.documentName,
      documentMimeType: input.documentMimeType,
      documentSizeBytes: input.documentSizeBytes,
    });

    await this.conversationRepository.updateLastMessageAt(
      input.conversationId,
      message.createdAt,
    );

    return message;
  }
}
