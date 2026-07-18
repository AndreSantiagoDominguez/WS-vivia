import { Conversation } from '../../domain/entities/conversation.entity';
import { IConversationRepository } from '../../domain/repositories/conversation.repository';
import {
  ConversationNotFoundError,
  NotConversationParticipantError,
} from '../errors';
import { HideConversationUseCase } from './hide-conversation.use-case';

const PARTICIPANT_ONE = 'aaaaaaaa-0000-0000-0000-000000000001';
const PARTICIPANT_TWO = 'bbbbbbbb-0000-0000-0000-000000000002';
const OUTSIDER = 'cccccccc-0000-0000-0000-000000000003';

function buildConversation(): Conversation {
  return new Conversation({
    id: 'conv-1',
    participantOneId: PARTICIPANT_ONE,
    participantOneRole: 'ROLE_LESSEE',
    participantTwoId: PARTICIPANT_TWO,
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

describe('HideConversationUseCase', () => {
  let conversationRepository: jest.Mocked<IConversationRepository>;
  let useCase: HideConversationUseCase;

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
    };
    useCase = new HideConversationUseCase(conversationRepository);
  });

  it('hides the conversation for the requesting participant', async () => {
    conversationRepository.findById.mockResolvedValue(buildConversation());

    await useCase.execute({
      conversationId: 'conv-1',
      requesterId: PARTICIPANT_ONE,
    });

    expect(conversationRepository.hideForParticipant).toHaveBeenCalledWith(
      'conv-1',
      PARTICIPANT_ONE,
    );
  });

  it('rejects when the conversation does not exist', async () => {
    conversationRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        conversationId: 'missing',
        requesterId: PARTICIPANT_ONE,
      }),
    ).rejects.toThrow(ConversationNotFoundError);
    expect(conversationRepository.hideForParticipant).not.toHaveBeenCalled();
  });

  it('rejects when the requester is not a participant', async () => {
    conversationRepository.findById.mockResolvedValue(buildConversation());

    await expect(
      useCase.execute({ conversationId: 'conv-1', requesterId: OUTSIDER }),
    ).rejects.toThrow(NotConversationParticipantError);
    expect(conversationRepository.hideForParticipant).not.toHaveBeenCalled();
  });
});
