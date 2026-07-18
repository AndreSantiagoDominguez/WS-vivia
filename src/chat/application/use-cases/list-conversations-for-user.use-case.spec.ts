import { Conversation } from '../../domain/entities/conversation.entity';
import {
  ConversationSummary,
  IConversationRepository,
} from '../../domain/repositories/conversation.repository';
import { ListConversationsForUserUseCase } from './list-conversations-for-user.use-case';

const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

describe('ListConversationsForUserUseCase', () => {
  let conversationRepository: jest.Mocked<IConversationRepository>;
  let useCase: ListConversationsForUserUseCase;

  beforeEach(() => {
    conversationRepository = {
      findById: jest.fn(),
      findByParticipants: jest.fn(),
      create: jest.fn(),
      findAllForUser: jest.fn(),
      updateLastMessageAt: jest.fn(),
      reassignParticipants: jest.fn(),
      delete: jest.fn(),
      hideForParticipant: jest.fn(),
      findConversationSummariesForUser: jest.fn(),
    };
    useCase = new ListConversationsForUserUseCase(conversationRepository);
  });

  it('delegates to findConversationSummariesForUser and returns its result', async () => {
    const summaries: ConversationSummary[] = [
      {
        conversation: new Conversation({
          id: 'conv-1',
          participantOneId: USER_ID,
          participantOneRole: 'ROLE_LESSEE',
          participantTwoId: 'bbbbbbbb-0000-0000-0000-000000000002',
          participantTwoRole: 'ROLE_LESSOR',
          propertyId: null,
          propertyTitle: null,
          lastMessageAt: new Date('2026-01-02T00:00:00.000Z'),
          hiddenForParticipantOneAt: null,
          hiddenForParticipantTwoAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        }),
        lastMessageContent: 'hola',
        lastMessageType: 'text',
        unreadCount: 3,
      },
    ];
    conversationRepository.findConversationSummariesForUser.mockResolvedValue(
      summaries,
    );

    const result = await useCase.execute(USER_ID);

    expect(result).toBe(summaries);
    expect(
      conversationRepository.findConversationSummariesForUser,
    ).toHaveBeenCalledWith(USER_ID);
  });
});
