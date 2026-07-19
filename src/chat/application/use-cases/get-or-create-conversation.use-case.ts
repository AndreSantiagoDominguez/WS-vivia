import { Inject, Injectable } from '@nestjs/common';
import { Conversation } from '../../domain/entities/conversation.entity';
import {
  CONVERSATION_REPOSITORY,
  IConversationRepository,
} from '../../domain/repositories/conversation.repository';
import {
  IUserProfileCacheRepository,
  USER_PROFILE_CACHE_REPOSITORY,
} from '../../infrastructure/profile/user-profile-cache.repository';
import { SameParticipantError } from '../errors';

export interface GetOrCreateConversationInput {
  requesterId: string;
  requesterRole: string;
  requesterName?: string;
  requesterPhotoUrl?: string;
  otherUserId: string;
  otherUserRole: string;
  otherUserName?: string;
  otherUserPhotoUrl?: string;
  propertyId: string | null;
  propertyTitle: string | null;
}

@Injectable()
export class GetOrCreateConversationUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IConversationRepository,
    @Inject(USER_PROFILE_CACHE_REPOSITORY)
    private readonly userProfileCacheRepository: IUserProfileCacheRepository,
  ) {}

  async execute(input: GetOrCreateConversationInput): Promise<Conversation> {
    if (input.requesterId === input.otherUserId) {
      throw new SameParticipantError();
    }

    // Se refresca cada vez que el cliente manda esta info, sin importar si
    // la conversación ya existía — así una persona que aparece en varias
    // conversaciones queda con el mismo nombre/foto actualizado en todas,
    // en vez de una copia por conversación (ver IUserProfileCacheRepository).
    await this.refreshProfileIfProvided(
      input.requesterId,
      input.requesterName,
      input.requesterPhotoUrl,
    );
    await this.refreshProfileIfProvided(
      input.otherUserId,
      input.otherUserName,
      input.otherUserPhotoUrl,
    );

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

  private async refreshProfileIfProvided(
    userId: string,
    name: string | undefined,
    photoUrl: string | undefined,
  ): Promise<void> {
    if (!name) return;
    await this.userProfileCacheRepository.upsert({
      userId,
      name,
      photoUrl: photoUrl ?? null,
    });
  }
}
