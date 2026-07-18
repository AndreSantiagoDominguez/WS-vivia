import { Inject, Injectable } from '@nestjs/common';
import {
  CONVERSATION_REPOSITORY,
  IConversationRepository,
} from '../../domain/repositories/conversation.repository';
import {
  ConversationNotFoundError,
  NotConversationParticipantError,
} from '../errors';

export interface HideConversationInput {
  conversationId: string;
  requesterId: string;
}

/**
 * "Borrar chat" solo para quien lo pide — el otro participante conserva su
 * copia intacta. Si llega un mensaje nuevo después, `findAllForUser` lo hace
 * reaparecer solo para `requesterId` (ver `IConversationRepository.hideForParticipant`).
 */
@Injectable()
export class HideConversationUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IConversationRepository,
  ) {}

  async execute(input: HideConversationInput): Promise<void> {
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

    await this.conversationRepository.hideForParticipant(
      input.conversationId,
      input.requesterId,
    );
  }
}
