import { Inject, Injectable } from '@nestjs/common';
import {
  CONVERSATION_REPOSITORY,
  ConversationSummary,
  IConversationRepository,
} from '../../domain/repositories/conversation.repository';

@Injectable()
export class ListConversationsForUserUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IConversationRepository,
  ) {}

  async execute(userId: string): Promise<ConversationSummary[]> {
    return this.conversationRepository.findConversationSummariesForUser(userId);
  }
}
