import { Inject, Injectable } from '@nestjs/common';
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

export interface MarkMessagesReadInput {
  conversationId: string;
  readerId: string;
}

@Injectable()
export class MarkMessagesReadUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IConversationRepository,
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
  ) {}

  async execute(input: MarkMessagesReadInput): Promise<number> {
    const conversation = await this.conversationRepository.findById(
      input.conversationId,
    );
    if (!conversation) {
      throw new ConversationNotFoundError(input.conversationId);
    }
    if (!conversation.hasParticipant(input.readerId)) {
      throw new NotConversationParticipantError(
        input.readerId,
        input.conversationId,
      );
    }

    return this.messageRepository.markAsReadForRecipient(
      input.conversationId,
      input.readerId,
    );
  }
}
