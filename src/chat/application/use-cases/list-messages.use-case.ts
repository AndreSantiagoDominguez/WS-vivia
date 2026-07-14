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
import {
  ConversationNotFoundError,
  NotConversationParticipantError,
} from '../errors';

export interface ListMessagesInput {
  conversationId: string;
  requesterId: string;
  before?: Date;
  limit: number;
}

@Injectable()
export class ListMessagesUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IConversationRepository,
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
  ) {}

  async execute(input: ListMessagesInput): Promise<Message[]> {
    const conversation = await this.conversationRepository.findById(
      input.conversationId,
    );
    if (!conversation) {
      throw new ConversationNotFoundError(input.conversationId);
    }
    if (!conversation.hasParticipant(input.requesterId)) {
      throw new NotConversationParticipantError(
        input.requesterId,
        input.conversationId,
      );
    }

    return this.messageRepository.findByConversationId(input.conversationId, {
      before: input.before,
      limit: input.limit,
    });
  }
}
