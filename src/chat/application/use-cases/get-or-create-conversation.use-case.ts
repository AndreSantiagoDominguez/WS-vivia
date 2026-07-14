import { Inject, Injectable } from '@nestjs/common';
import { Conversation } from '../../domain/entities/conversation.entity';
import {
  CONVERSATION_REPOSITORY,
  IConversationRepository,
} from '../../domain/repositories/conversation.repository';
import { SameParticipantError } from '../errors';

export interface GetOrCreateConversationInput {
  requesterId: string;
  requesterRole: string;
  otherUserId: string;
  otherUserRole: string;
  propertyId: string | null;
  propertyTitle: string | null;
}

@Injectable()
export class GetOrCreateConversationUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IConversationRepository,
  ) {}

  async execute(input: GetOrCreateConversationInput): Promise<Conversation> {
    if (input.requesterId === input.otherUserId) {
      throw new SameParticipantError();
    }

    const ordered = Conversation.orderParticipants(
      { userId: input.requesterId, role: input.requesterRole },
      { userId: input.otherUserId, role: input.otherUserRole },
    );

    const existing = await this.conversationRepository.findByParticipants(
      ordered.participantOneId,
      ordered.participantTwoId,
    );
    if (existing) {
      return existing;
    }

    return this.conversationRepository.create({
      ...ordered,
      propertyId: input.propertyId,
      propertyTitle: input.propertyTitle,
    });
  }
}
