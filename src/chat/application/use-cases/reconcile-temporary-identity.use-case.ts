import { Inject, Injectable } from '@nestjs/common';
import { Conversation } from '../../domain/entities/conversation.entity';
import {
  CONVERSATION_REPOSITORY,
  IConversationRepository,
} from '../../domain/repositories/conversation.repository';
import {
  IMessageRepository,
  MESSAGE_REPOSITORY,
} from '../../domain/repositories/message.repository';

export interface ReconcileTemporaryIdentityInput {
  /** Identidad temporal derivada del email, la que se venía usando hasta ahora. */
  oldUserId: string;
  /** Identidad real que mandó Spring Boot en un token completo. */
  newUserId: string;
  role: string;
}

/**
 * Migra todo lo que se creó bajo una identidad temporal (ver
 * `deriveTemporaryUserId`) hacia la identidad real, en cuanto Spring Boot
 * manda un token completo para ese mismo email. Se dispara desde
 * `JwtVerificationService`.
 *
 * Es naturalmente resumible: si se interrumpe a mitad de camino, la fila de
 * `user_identities` sigue marcada como temporal, así que la próxima vez que
 * llegue un token completo para ese email se vuelve a intentar — y
 * `findAllForUser(oldUserId)` esa vez devuelve menos resultados porque parte
 * ya quedó migrada. No hace falta una transacción cruzada entre agregados.
 */
@Injectable()
export class ReconcileTemporaryIdentityUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IConversationRepository,
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
  ) {}

  async execute(input: ReconcileTemporaryIdentityInput): Promise<void> {
    const conversations = await this.conversationRepository.findAllForUser(
      input.oldUserId,
    );

    for (const conversation of conversations) {
      const other = conversation.otherParticipant(input.oldUserId);
      const ordered = Conversation.orderParticipants(
        { userId: input.newUserId, role: input.role },
        other,
      );

      const existing = await this.conversationRepository.findByParticipants(
        ordered.participantOneId,
        ordered.participantTwoId,
      );

      if (existing) {
        // El usuario real ya tenía una conversación real con esta misma persona:
        // se fusionan los mensajes en la conversación real y se descarta la temporal.
        await this.messageRepository.reassignConversation(
          conversation.id,
          existing.id,
        );
        await this.conversationRepository.delete(conversation.id);
      } else {
        await this.conversationRepository.reassignParticipants(
          conversation.id,
          ordered.participantOneId,
          ordered.participantOneRole,
          ordered.participantTwoId,
          ordered.participantTwoRole,
        );
      }
    }

    await this.messageRepository.reassignSender(
      input.oldUserId,
      input.newUserId,
    );
  }
}
