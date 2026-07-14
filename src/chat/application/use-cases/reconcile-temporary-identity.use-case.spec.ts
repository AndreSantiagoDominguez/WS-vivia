import { Conversation } from '../../domain/entities/conversation.entity';
import { IConversationRepository } from '../../domain/repositories/conversation.repository';
import { IMessageRepository } from '../../domain/repositories/message.repository';
import { ReconcileTemporaryIdentityUseCase } from './reconcile-temporary-identity.use-case';

const OLD_TEMP_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const NEW_REAL_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const OTHER_PARTICIPANT_ID = 'cccccccc-0000-0000-0000-000000000003';

function buildConversation(
  overrides: Partial<Conversation> = {},
): Conversation {
  return new Conversation({
    id: 'conv-temp',
    participantOneId: OLD_TEMP_ID,
    participantOneRole: 'ROLE_LESSEE',
    participantTwoId: OTHER_PARTICIPANT_ID,
    participantTwoRole: 'ROLE_LESSOR',
    propertyId: null,
    propertyTitle: null,
    lastMessageAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });
}

describe('ReconcileTemporaryIdentityUseCase', () => {
  let conversationRepository: jest.Mocked<IConversationRepository>;
  let messageRepository: jest.Mocked<IMessageRepository>;
  let useCase: ReconcileTemporaryIdentityUseCase;

  beforeEach(() => {
    conversationRepository = {
      findById: jest.fn(),
      findByParticipants: jest.fn(),
      create: jest.fn(),
      findAllForUser: jest.fn(),
      updateLastMessageAt: jest.fn(),
      reassignParticipants: jest.fn(),
      delete: jest.fn(),
    };
    messageRepository = {
      create: jest.fn(),
      findByConversationId: jest.fn(),
      markAsReadForRecipient: jest.fn(),
      reassignConversation: jest.fn(),
      reassignSender: jest.fn(),
    };
    useCase = new ReconcileTemporaryIdentityUseCase(
      conversationRepository,
      messageRepository,
    );
  });

  it('replaces the participant id in place when there is no conflicting conversation', async () => {
    const tempConversation = buildConversation();
    conversationRepository.findAllForUser.mockResolvedValue([tempConversation]);
    conversationRepository.findByParticipants.mockResolvedValue(null);

    await useCase.execute({
      oldUserId: OLD_TEMP_ID,
      newUserId: NEW_REAL_ID,
      role: 'ROLE_LESSEE',
    });

    expect(conversationRepository.reassignParticipants).toHaveBeenCalledWith(
      'conv-temp',
      NEW_REAL_ID,
      'ROLE_LESSEE',
      OTHER_PARTICIPANT_ID,
      'ROLE_LESSOR',
    );
    expect(conversationRepository.delete).not.toHaveBeenCalled();
    expect(messageRepository.reassignConversation).not.toHaveBeenCalled();
    expect(messageRepository.reassignSender).toHaveBeenCalledWith(
      OLD_TEMP_ID,
      NEW_REAL_ID,
    );
  });

  it('merges into the existing real conversation and discards the temporary one on conflict', async () => {
    const tempConversation = buildConversation();
    const realConversation = buildConversation({
      id: 'conv-real',
      participantOneId: NEW_REAL_ID,
    });
    conversationRepository.findAllForUser.mockResolvedValue([tempConversation]);
    conversationRepository.findByParticipants.mockResolvedValue(
      realConversation,
    );

    await useCase.execute({
      oldUserId: OLD_TEMP_ID,
      newUserId: NEW_REAL_ID,
      role: 'ROLE_LESSEE',
    });

    expect(messageRepository.reassignConversation).toHaveBeenCalledWith(
      'conv-temp',
      'conv-real',
    );
    expect(conversationRepository.delete).toHaveBeenCalledWith('conv-temp');
    expect(conversationRepository.reassignParticipants).not.toHaveBeenCalled();
    expect(messageRepository.reassignSender).toHaveBeenCalledWith(
      OLD_TEMP_ID,
      NEW_REAL_ID,
    );
  });

  it('still reassigns the sender when the temporary identity has no conversations', async () => {
    conversationRepository.findAllForUser.mockResolvedValue([]);

    await useCase.execute({
      oldUserId: OLD_TEMP_ID,
      newUserId: NEW_REAL_ID,
      role: 'ROLE_LESSEE',
    });

    expect(conversationRepository.reassignParticipants).not.toHaveBeenCalled();
    expect(messageRepository.reassignSender).toHaveBeenCalledWith(
      OLD_TEMP_ID,
      NEW_REAL_ID,
    );
  });
});
