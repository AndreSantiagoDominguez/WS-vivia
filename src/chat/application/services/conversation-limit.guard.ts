import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Conversation } from '../../domain/entities/conversation.entity';
import {
  IMessageRepository,
  MESSAGE_REPOSITORY,
} from '../../domain/repositories/message.repository';
import {
  ILessorSubscriptionRepository,
  LESSOR_SUBSCRIPTION_REPOSITORY,
} from '../../infrastructure/subscription/lessor-subscription.repository';
import { ConversationLimitReachedError } from '../errors';

const ROLE_LESSOR = 'ROLE_LESSOR';
const DEFAULT_FREE_CONVERSATION_LIMIT = 2;

/**
 * Regla de negocio del plan free en el chat: un lessor free solo puede sostener
 * un número máximo de conversaciones activas. El cupo se consume cuando el
 * lessor RESPONDE (manda su primer mensaje en una conversación), no cuando el
 * lessee lo contacta — por eso el gate solo aplica a envíos del propio lessor y
 * los lessees nunca se bloquean. Espejo de `PremiumGuard` en el backend `vivia`.
 */
@Injectable()
export class ConversationLimitGuard {
  private readonly logger = new Logger(ConversationLimitGuard.name);
  private readonly freeConversationLimit: number;

  constructor(
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
    @Inject(LESSOR_SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepository: ILessorSubscriptionRepository,
    configService: ConfigService,
  ) {
    // Las env vars llegan como string; se fuerza a número y se cae al default
    // ante un valor ausente, vacío o no numérico (Number('') es 0, por eso se
    // descarta la cadena vacía explícitamente).
    const raw = configService.get<string>('CHAT_FREE_CONVERSATION_LIMIT');
    const configured = Number(raw);
    this.freeConversationLimit =
      raw != null && raw !== '' && Number.isFinite(configured)
        ? configured
        : DEFAULT_FREE_CONVERSATION_LIMIT;
  }

  /**
   * Lanza `ConversationLimitReachedError` si `senderId` es el lessor de la
   * conversación, está estrenándola (aún no mandó ningún mensaje aquí) y ya
   * alcanzó su límite gratuito de conversaciones activas. No hace nada si el
   * emisor es el lessee, si el lessor es premium (o no se pudo determinar), o
   * si la conversación ya contaba (el lessor ya había respondido antes).
   */
  async assertLessorCanRespond(
    conversation: Conversation,
    senderId: string,
  ): Promise<void> {
    if (this.senderRole(conversation, senderId) !== ROLE_LESSOR) {
      return;
    }

    const alreadyActive =
      await this.messageRepository.hasSenderMessagedInConversation(
        conversation.id,
        senderId,
      );
    if (alreadyActive) {
      return;
    }

    const premiumStatus =
      await this.subscriptionRepository.getPremiumStatus(senderId);
    if (premiumStatus === 'PREMIUM') {
      return;
    }
    if (premiumStatus === 'UNKNOWN') {
      // No se pudo consultar la suscripción: se deja pasar. Bloquear aquí
      // castigaría a un lessor premium por una caída del subsistema de
      // suscripciones, que es peor que dejar colar una conversación de más.
      this.logger.warn(
        `No se pudo determinar el premium del lessor ${senderId}; se permite la conversación sin aplicar el límite free`,
      );
      return;
    }

    const activeConversations =
      await this.messageRepository.countLessorConversations(senderId);
    if (activeConversations >= this.freeConversationLimit) {
      throw new ConversationLimitReachedError(this.freeConversationLimit);
    }
  }

  private senderRole(
    conversation: Conversation,
    senderId: string,
  ): string | null {
    if (conversation.participantOneId === senderId) {
      return conversation.participantOneRole;
    }
    if (conversation.participantTwoId === senderId) {
      return conversation.participantTwoRole;
    }
    return null;
  }
}
