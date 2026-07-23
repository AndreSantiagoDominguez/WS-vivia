import { ConfigService } from '@nestjs/config';
import { Conversation } from '../../domain/entities/conversation.entity';
import { IMessageRepository } from '../../domain/repositories/message.repository';
import { ILessorSubscriptionRepository } from '../../infrastructure/subscription/lessor-subscription.repository';
import { ConversationLimitReachedError } from '../errors';
import { ConversationLimitGuard } from './conversation-limit.guard';

const LESSEE_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const LESSOR_ID = 'bbbbbbbb-0000-0000-0000-000000000002';

function buildConversation(): Conversation {
  return new Conversation({
    id: 'conv-1',
    participantOneId: LESSEE_ID,
    participantOneRole: 'ROLE_LESSEE',
    participantTwoId: LESSOR_ID,
    participantTwoRole: 'ROLE_LESSOR',
    propertyId: null,
    propertyTitle: null,
    lastMessageAt: null,
    hiddenForParticipantOneAt: null,
    hiddenForParticipantTwoAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

describe('ConversationLimitGuard', () => {
  let messageRepository: jest.Mocked<
    Pick<
      IMessageRepository,
      'countLessorConversations' | 'hasSenderMessagedInConversation'
    >
  >;
  let subscriptionRepository: jest.Mocked<ILessorSubscriptionRepository>;
  let guard: ConversationLimitGuard;

  beforeEach(() => {
    messageRepository = {
      countLessorConversations: jest.fn(),
      hasSenderMessagedInConversation: jest.fn(),
    };
    subscriptionRepository = { getPremiumStatus: jest.fn() };
    // get() devuelve undefined → el guard cae al límite por default (2).
    const configService = { get: jest.fn() } as unknown as ConfigService;
    guard = new ConversationLimitGuard(
      messageRepository as unknown as IMessageRepository,
      subscriptionRepository,
      configService,
    );
  });

  it('nunca bloquea al lessee (solo el lessor consume cupo)', async () => {
    await expect(
      guard.assertLessorCanRespond(buildConversation(), LESSEE_ID),
    ).resolves.toBeUndefined();

    expect(subscriptionRepository.getPremiumStatus).not.toHaveBeenCalled();
    expect(messageRepository.countLessorConversations).not.toHaveBeenCalled();
  });

  it('permite al lessor seguir en una conversación donde ya respondió', async () => {
    messageRepository.hasSenderMessagedInConversation.mockResolvedValue(true);

    await expect(
      guard.assertLessorCanRespond(buildConversation(), LESSOR_ID),
    ).resolves.toBeUndefined();

    expect(subscriptionRepository.getPremiumStatus).not.toHaveBeenCalled();
    expect(messageRepository.countLessorConversations).not.toHaveBeenCalled();
  });

  it('permite al lessor premium sin importar el conteo', async () => {
    messageRepository.hasSenderMessagedInConversation.mockResolvedValue(false);
    subscriptionRepository.getPremiumStatus.mockResolvedValue('PREMIUM');

    await expect(
      guard.assertLessorCanRespond(buildConversation(), LESSOR_ID),
    ).resolves.toBeUndefined();

    expect(messageRepository.countLessorConversations).not.toHaveBeenCalled();
  });

  it('permite al lessor free por debajo del límite estrenar una conversación', async () => {
    messageRepository.hasSenderMessagedInConversation.mockResolvedValue(false);
    subscriptionRepository.getPremiumStatus.mockResolvedValue('FREE');
    messageRepository.countLessorConversations.mockResolvedValue(1);

    await expect(
      guard.assertLessorCanRespond(buildConversation(), LESSOR_ID),
    ).resolves.toBeUndefined();
  });

  it('bloquea al lessor free que ya tiene el máximo de conversaciones activas', async () => {
    messageRepository.hasSenderMessagedInConversation.mockResolvedValue(false);
    subscriptionRepository.getPremiumStatus.mockResolvedValue('FREE');
    messageRepository.countLessorConversations.mockResolvedValue(2);

    await expect(
      guard.assertLessorCanRespond(buildConversation(), LESSOR_ID),
    ).rejects.toBeInstanceOf(ConversationLimitReachedError);
  });

  // Un fallo del subsistema de suscripciones no puede castigar a un lessor que
  // sí es premium: ante la duda se deja pasar, no se bloquea.
  it('no bloquea cuando no se pudo determinar el estado premium', async () => {
    messageRepository.hasSenderMessagedInConversation.mockResolvedValue(false);
    subscriptionRepository.getPremiumStatus.mockResolvedValue('UNKNOWN');

    await expect(
      guard.assertLessorCanRespond(buildConversation(), LESSOR_ID),
    ).resolves.toBeUndefined();

    expect(messageRepository.countLessorConversations).not.toHaveBeenCalled();
  });
});
