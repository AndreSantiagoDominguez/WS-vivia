import { Message } from '../../domain/entities/message.entity';
import { IMessageRepository } from '../../domain/repositories/message.repository';
import {
  CannotEditDocumentMessageError,
  InvalidMessageContentError,
  MessageAlreadyDeletedError,
  MessageEditWindowExpiredError,
  MessageNotFoundError,
  NotMessageSenderError,
} from '../errors';
import { EditMessageUseCase } from './edit-message.use-case';

const SENDER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const OUTSIDER_ID = 'cccccccc-0000-0000-0000-000000000003';

function buildMessage(overrides: Partial<Message> = {}): Message {
  return new Message({
    id: 'msg-1',
    conversationId: 'conv-1',
    senderId: SENDER_ID,
    type: 'text',
    content: 'hola',
    documentUrl: null,
    documentName: null,
    documentMimeType: null,
    documentSizeBytes: null,
    readAt: null,
    deletedAt: null,
    editedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('EditMessageUseCase', () => {
  let messageRepository: jest.Mocked<IMessageRepository>;
  let useCase: EditMessageUseCase;

  beforeEach(() => {
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
    useCase = new EditMessageUseCase(messageRepository);
  });

  it('updates the content and marks editedAt when within the window', async () => {
    messageRepository.findById.mockResolvedValue(
      buildMessage({ createdAt: new Date(Date.now() - 2 * 60_000) }),
    );
    const edited = buildMessage({
      content: 'hola corregido',
      editedAt: new Date(),
    });
    messageRepository.updateContent.mockResolvedValue(edited);

    const result = await useCase.execute({
      messageId: 'msg-1',
      requesterId: SENDER_ID,
      content: '  hola corregido  ',
    });

    expect(result).toBe(edited);
    expect(messageRepository.updateContent).toHaveBeenCalledWith(
      'msg-1',
      'hola corregido',
      expect.any(Date),
    );
  });

  it('rejects editing a message older than 15 minutes', async () => {
    messageRepository.findById.mockResolvedValue(
      buildMessage({ createdAt: new Date(Date.now() - 16 * 60_000) }),
    );

    await expect(
      useCase.execute({
        messageId: 'msg-1',
        requesterId: SENDER_ID,
        content: 'algo nuevo',
      }),
    ).rejects.toThrow(MessageEditWindowExpiredError);
    expect(messageRepository.updateContent).not.toHaveBeenCalled();
  });

  it('rejects editing content outside 1-4000 characters', async () => {
    await expect(
      useCase.execute({
        messageId: 'msg-1',
        requesterId: SENDER_ID,
        content: '   ',
      }),
    ).rejects.toThrow(InvalidMessageContentError);
    expect(messageRepository.findById).not.toHaveBeenCalled();

    await expect(
      useCase.execute({
        messageId: 'msg-1',
        requesterId: SENDER_ID,
        content: 'a'.repeat(4001),
      }),
    ).rejects.toThrow(InvalidMessageContentError);
  });

  it('rejects when the requester is not the sender', async () => {
    messageRepository.findById.mockResolvedValue(buildMessage());

    await expect(
      useCase.execute({
        messageId: 'msg-1',
        requesterId: OUTSIDER_ID,
        content: 'algo',
      }),
    ).rejects.toThrow(NotMessageSenderError);
  });

  it('rejects editing a document message', async () => {
    messageRepository.findById.mockResolvedValue(
      buildMessage({ type: 'document', content: 'caption' }),
    );

    await expect(
      useCase.execute({
        messageId: 'msg-1',
        requesterId: SENDER_ID,
        content: 'nuevo caption',
      }),
    ).rejects.toThrow(CannotEditDocumentMessageError);
  });

  it('rejects editing an already-deleted message', async () => {
    messageRepository.findById.mockResolvedValue(
      buildMessage({ deletedAt: new Date() }),
    );

    await expect(
      useCase.execute({
        messageId: 'msg-1',
        requesterId: SENDER_ID,
        content: 'algo',
      }),
    ).rejects.toThrow(MessageAlreadyDeletedError);
  });

  it('rejects when the message does not exist', async () => {
    messageRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        messageId: 'missing',
        requesterId: SENDER_ID,
        content: 'algo',
      }),
    ).rejects.toThrow(MessageNotFoundError);
  });
});
