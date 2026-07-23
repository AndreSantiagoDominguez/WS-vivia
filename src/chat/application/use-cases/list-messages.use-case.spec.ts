import { Conversation } from '../../domain/entities/conversation.entity';
import { Message } from '../../domain/entities/message.entity';
import { IConversationRepository } from '../../domain/repositories/conversation.repository';
import { IMessageRepository } from '../../domain/repositories/message.repository';
import {
  ConversationNotFoundError,
  NotConversationParticipantError,
} from '../errors';
import { ListMessagesUseCase } from './list-messages.use-case';

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

describe('ListMessagesUseCase', () => {
  let conversationRepository: jest.Mocked<IConversationRepository>;
  let messageRepository: jest.Mocked<IMessageRepository>;
  let useCase: ListMessagesUseCase;

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
    messageRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByConversationId: jest.fn(),
      markAsReadForRecipient: jest.fn(),
      hardDelete: jest.fn(),
      softDelete: jest.fn(),
      updateContent: jest.fn(),
      reassignConversation: jest.fn(),
      reassignSender: jest.fn(),
      countLessorConversations: jest.fn(),
      hasSenderMessagedInConversation: jest.fn(),
    };
    useCase = new ListMessagesUseCase(
      conversationRepository,
      messageRepository,
    );
  });

  it('returns the paginated history for a participant', async () => {
    conversationRepository.findById.mockResolvedValue(buildConversation());
    const messages = [
      new Message({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: PARTICIPANT_ONE,
        type: 'text',
        content: 'hola',
        documentUrl: null,
        documentName: null,
        documentMimeType: null,
        documentSizeBytes: null,
        readAt: null,
        deletedAt: null,
        editedAt: null,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
    ];
    messageRepository.findByConversationId.mockResolvedValue(messages);

    const result = await useCase.execute({
      conversationId: 'conv-1',
      requesterId: PARTICIPANT_ONE,
      limit: 50,
    });

    expect(result).toBe(messages);
    expect(messageRepository.findByConversationId).toHaveBeenCalledWith(
      'conv-1',
      {
        before: undefined,
        limit: 50,
      },
    );
  });

  it('rejects when the conversation does not exist', async () => {
    conversationRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        conversationId: 'missing',
        requesterId: PARTICIPANT_ONE,
        limit: 50,
      }),
    ).rejects.toThrow(ConversationNotFoundError);
  });

  it('rejects when the requester is not a participant', async () => {
    conversationRepository.findById.mockResolvedValue(buildConversation());

    await expect(
      useCase.execute({
        conversationId: 'conv-1',
        requesterId: OUTSIDER,
        limit: 50,
      }),
    ).rejects.toThrow(NotConversationParticipantError);
    expect(messageRepository.findByConversationId).not.toHaveBeenCalled();
  });
});
