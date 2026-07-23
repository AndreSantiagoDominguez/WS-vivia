import { Message } from '../../domain/entities/message.entity';
import { IMessageRepository } from '../../domain/repositories/message.repository';
import {
  MessageAlreadyDeletedError,
  MessageDeleteWindowExpiredError,
  MessageNotFoundError,
  NotMessageSenderError,
} from '../errors';
import { DeleteMessageUseCase } from './delete-message.use-case';

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

describe('DeleteMessageUseCase', () => {
  let messageRepository: jest.Mocked<IMessageRepository>;
  let useCase: DeleteMessageUseCase;

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
    useCase = new DeleteMessageUseCase(messageRepository);
  });

  it('hard-deletes without a trace when created less than a minute ago', async () => {
    messageRepository.findById.mockResolvedValue(
      buildMessage({ createdAt: new Date(Date.now() - 30_000) }),
    );

    const result = await useCase.execute({
      messageId: 'msg-1',
      requesterId: SENDER_ID,
    });

    expect(result).toEqual({
      hardDeleted: true,
      conversationId: 'conv-1',
      messageId: 'msg-1',
    });
    expect(messageRepository.hardDelete).toHaveBeenCalledWith('msg-1');
    expect(messageRepository.softDelete).not.toHaveBeenCalled();
  });

  it('soft-deletes leaving a placeholder when between 1 and 5 minutes old', async () => {
    messageRepository.findById.mockResolvedValue(
      buildMessage({ createdAt: new Date(Date.now() - 3 * 60_000) }),
    );
    const softDeleted = buildMessage({
      content: null,
      deletedAt: new Date(),
    });
    messageRepository.softDelete.mockResolvedValue(softDeleted);

    const result = await useCase.execute({
      messageId: 'msg-1',
      requesterId: SENDER_ID,
    });

    expect(result).toEqual({ hardDeleted: false, message: softDeleted });
    expect(messageRepository.hardDelete).not.toHaveBeenCalled();
    expect(messageRepository.softDelete).toHaveBeenCalledWith(
      'msg-1',
      expect.any(Date),
    );
  });

  it('rejects deleting a message older than 5 minutes', async () => {
    messageRepository.findById.mockResolvedValue(
      buildMessage({ createdAt: new Date(Date.now() - 6 * 60_000) }),
    );

    await expect(
      useCase.execute({ messageId: 'msg-1', requesterId: SENDER_ID }),
    ).rejects.toThrow(MessageDeleteWindowExpiredError);
    expect(messageRepository.hardDelete).not.toHaveBeenCalled();
    expect(messageRepository.softDelete).not.toHaveBeenCalled();
  });

  it('rejects when the requester is not the sender', async () => {
    messageRepository.findById.mockResolvedValue(buildMessage());

    await expect(
      useCase.execute({ messageId: 'msg-1', requesterId: OUTSIDER_ID }),
    ).rejects.toThrow(NotMessageSenderError);
  });

  it('rejects when the message does not exist', async () => {
    messageRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ messageId: 'missing', requesterId: SENDER_ID }),
    ).rejects.toThrow(MessageNotFoundError);
  });

  it('rejects deleting an already-deleted message', async () => {
    messageRepository.findById.mockResolvedValue(
      buildMessage({ deletedAt: new Date() }),
    );

    await expect(
      useCase.execute({ messageId: 'msg-1', requesterId: SENDER_ID }),
    ).rejects.toThrow(MessageAlreadyDeletedError);
  });
});
