import { Inject, Injectable } from '@nestjs/common';
import { Message } from '../../domain/entities/message.entity';
import {
  CONVERSATION_REPOSITORY,
  IConversationRepository,
} from '../../domain/repositories/conversation.repository';
import {
  MESSAGE_REPOSITORY,
  IMessageRepository,
} from '../../domain/repositories/message.repository';
import { ConversationLimitGuard } from '../services/conversation-limit.guard';
import {
  ConversationNotFoundError,
  InvalidMessageContentError,
  NotConversationParticipantError,
} from '../errors';

export interface CreateMessageInput {
  conversationId: string;
  senderId: string;
  content: string;
}

const MIN_CONTENT_LENGTH = 1;
const MAX_CONTENT_LENGTH = 4000;

@Injectable()
export class CreateMessageUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IConversationRepository,
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
    private readonly conversationLimitGuard: ConversationLimitGuard,
  ) {}

  async execute(input: CreateMessageInput): Promise<Message> {
    const content = input.content?.trim() ?? '';
    if (
      content.length < MIN_CONTENT_LENGTH ||
      content.length > MAX_CONTENT_LENGTH
    ) {
      throw new InvalidMessageContentError();
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
      type: 'text',
      content,
    });

    await this.conversationRepository.updateLastMessageAt(
      input.conversationId,
      message.createdAt,
    );

    return message;
  }
}
