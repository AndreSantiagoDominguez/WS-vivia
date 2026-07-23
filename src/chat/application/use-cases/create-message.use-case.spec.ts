import { Conversation } from '../../domain/entities/conversation.entity';
import { Message } from '../../domain/entities/message.entity';
import { IConversationRepository } from '../../domain/repositories/conversation.repository';
import { IMessageRepository } from '../../domain/repositories/message.repository';
import {
  ConversationNotFoundError,
  InvalidMessageContentError,
  NotConversationParticipantError,
} from '../errors';
import { ConversationLimitGuard } from '../services/conversation-limit.guard';
import { CreateMessageUseCase } from './create-message.use-case';

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

describe('CreateMessageUseCase', () => {
  let conversationRepository: jest.Mocked<IConversationRepository>;
  let messageRepository: jest.Mocked<IMessageRepository>;
  let useCase: CreateMessageUseCase;

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
      countDistinctConversationsBySender: jest.fn(),
      hasSenderMessagedInConversation: jest.fn(),
    };
    const conversationLimitGuard = {
      assertLessorCanRespond: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConversationLimitGuard;
    useCase = new CreateMessageUseCase(
      conversationRepository,
      messageRepository,
      conversationLimitGuard,
    );
  });

  it('persists the message and bumps the conversation last-message timestamp', async () => {
    conversationRepository.findById.mockResolvedValue(buildConversation());
    const saved = new Message({
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
    });
    messageRepository.create.mockResolvedValue(saved);

    const result = await useCase.execute({
      conversationId: 'conv-1',
      senderId: PARTICIPANT_ONE,
      content: 'hola',
    });

    expect(result).toBe(saved);
    expect(conversationRepository.updateLastMessageAt).toHaveBeenCalledWith(
      'conv-1',
      saved.createdAt,
    );
  });

  it('rejects content that is empty after trimming', async () => {
    await expect(
      useCase.execute({
        conversationId: 'conv-1',
        senderId: PARTICIPANT_ONE,
        content: '   ',
      }),
    ).rejects.toThrow(InvalidMessageContentError);
    expect(conversationRepository.findById).not.toHaveBeenCalled();
  });

  it('rejects content longer than 4000 characters', async () => {
    await expect(
      useCase.execute({
        conversationId: 'conv-1',
        senderId: PARTICIPANT_ONE,
        content: 'a'.repeat(4001),
      }),
    ).rejects.toThrow(InvalidMessageContentError);
  });

  it('rejects when the conversation does not exist', async () => {
    conversationRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        conversationId: 'missing',
        senderId: PARTICIPANT_ONE,
        content: 'hola',
      }),
    ).rejects.toThrow(ConversationNotFoundError);
  });

  it('rejects when the sender is not a participant', async () => {
    conversationRepository.findById.mockResolvedValue(buildConversation());

    await expect(
      useCase.execute({
        conversationId: 'conv-1',
        senderId: OUTSIDER,
        content: 'hola',
      }),
    ).rejects.toThrow(NotConversationParticipantError);
    expect(messageRepository.create).not.toHaveBeenCalled();
  });
});
