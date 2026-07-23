import { Conversation } from '../../domain/entities/conversation.entity';
import { Message } from '../../domain/entities/message.entity';
import { IConversationRepository } from '../../domain/repositories/conversation.repository';
import { IMessageRepository } from '../../domain/repositories/message.repository';
import {
  ConversationNotFoundError,
  InvalidCaptionError,
  NotConversationParticipantError,
} from '../errors';
import { ConversationLimitGuard } from '../services/conversation-limit.guard';
import { CreateDocumentMessageUseCase } from './create-document-message.use-case';

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

const baseInput = {
  conversationId: 'conv-1',
  senderId: PARTICIPANT_ONE,
  caption: null as string | null,
  documentUrl:
    'https://res.cloudinary.com/demo/raw/upload/v1/vivia-chat/documents/contrato.pdf',
  documentName: 'contrato.pdf',
  documentMimeType: 'application/pdf',
  documentSizeBytes: 123_456,
};

describe('CreateDocumentMessageUseCase', () => {
  let conversationRepository: jest.Mocked<IConversationRepository>;
  let messageRepository: jest.Mocked<IMessageRepository>;
  let useCase: CreateDocumentMessageUseCase;

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
    const conversationLimitGuard = {
      assertLessorCanRespond: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConversationLimitGuard;
    useCase = new CreateDocumentMessageUseCase(
      conversationRepository,
      messageRepository,
      conversationLimitGuard,
    );
  });

  it('persists a document message without a caption and bumps last-message timestamp', async () => {
    conversationRepository.findById.mockResolvedValue(buildConversation());
    const saved = new Message({
      id: 'msg-1',
      conversationId: 'conv-1',
      senderId: PARTICIPANT_ONE,
      type: 'document',
      content: null,
      documentUrl: baseInput.documentUrl,
      documentName: baseInput.documentName,
      documentMimeType: baseInput.documentMimeType,
      documentSizeBytes: baseInput.documentSizeBytes,
      readAt: null,
      deletedAt: null,
      editedAt: null,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    messageRepository.create.mockResolvedValue(saved);

    const result = await useCase.execute(baseInput);

    expect(result).toBe(saved);
    expect(messageRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'document',
        content: null,
        documentUrl: baseInput.documentUrl,
      }),
    );
    expect(conversationRepository.updateLastMessageAt).toHaveBeenCalledWith(
      'conv-1',
      saved.createdAt,
    );
  });

  it('persists a document message with a trimmed caption', async () => {
    conversationRepository.findById.mockResolvedValue(buildConversation());
    messageRepository.create.mockResolvedValue(
      new Message({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: PARTICIPANT_ONE,
        type: 'document',
        content: 'firmado',
        documentUrl: baseInput.documentUrl,
        documentName: baseInput.documentName,
        documentMimeType: baseInput.documentMimeType,
        documentSizeBytes: baseInput.documentSizeBytes,
        readAt: null,
        deletedAt: null,
        editedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    await useCase.execute({ ...baseInput, caption: '  firmado  ' });

    expect(messageRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'firmado' }),
    );
  });

  it('rejects a caption longer than 4000 characters', async () => {
    await expect(
      useCase.execute({ ...baseInput, caption: 'a'.repeat(4001) }),
    ).rejects.toThrow(InvalidCaptionError);
    expect(conversationRepository.findById).not.toHaveBeenCalled();
  });

  it('rejects when the conversation does not exist', async () => {
    conversationRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ ...baseInput, conversationId: 'missing' }),
    ).rejects.toThrow(ConversationNotFoundError);
  });

  it('rejects when the sender is not a participant', async () => {
    conversationRepository.findById.mockResolvedValue(buildConversation());

    await expect(
      useCase.execute({ ...baseInput, senderId: OUTSIDER }),
    ).rejects.toThrow(NotConversationParticipantError);
    expect(messageRepository.create).not.toHaveBeenCalled();
  });
});
