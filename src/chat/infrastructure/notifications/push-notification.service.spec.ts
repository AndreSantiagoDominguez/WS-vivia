import { Conversation } from '../../domain/entities/conversation.entity';
import { Message } from '../../domain/entities/message.entity';
import { IConversationRepository } from '../../domain/repositories/conversation.repository';
import { ConnectionRegistryService } from '../websocket/connection-registry.service';
import { FirebaseAdminService } from './firebase-admin.service';
import { PushNotificationService } from './push-notification.service';
import { UsersFcmTokenRepository } from './users-fcm-token.repository';

const SENDER_ID = '11111111-1111-1111-1111-111111111111';
const RECIPIENT_ID = '22222222-2222-2222-2222-222222222222';
const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';

function buildConversation(): Conversation {
  return new Conversation({
    id: CONVERSATION_ID,
    participantOneId: SENDER_ID,
    participantOneRole: 'client',
    participantTwoId: RECIPIENT_ID,
    participantTwoRole: 'agent',
    propertyId: null,
    propertyTitle: null,
    lastMessageAt: null,
    hiddenForParticipantOneAt: null,
    hiddenForParticipantTwoAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function buildMessage(): Message {
  return new Message({
    id: 'msg-1',
    conversationId: CONVERSATION_ID,
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
  });
}

describe('PushNotificationService', () => {
  let send: jest.Mock;
  let firebaseAdmin: { getMessaging: jest.Mock };
  let tokenRepository: { getToken: jest.Mock };
  let connectionRegistry: { isUserOnline: jest.Mock };
  let conversationRepository: Pick<IConversationRepository, 'findById'>;
  let service: PushNotificationService;

  beforeEach(() => {
    send = jest.fn().mockResolvedValue('projects/x/messages/1');
    firebaseAdmin = { getMessaging: jest.fn().mockReturnValue({ send }) };
    tokenRepository = {
      getToken: jest.fn().mockResolvedValue('fcm-token-abc'),
    };
    connectionRegistry = { isUserOnline: jest.fn().mockReturnValue(false) };
    conversationRepository = {
      findById: jest.fn().mockResolvedValue(buildConversation()),
    };

    service = new PushNotificationService(
      firebaseAdmin as unknown as FirebaseAdminService,
      tokenRepository as unknown as UsersFcmTokenRepository,
      connectionRegistry as unknown as ConnectionRegistryService,
      conversationRepository as IConversationRepository,
    );
  });

  it('sends a push to the recipient when they are offline and have a token', async () => {
    await service.notifyNewMessage(buildMessage());

    expect(tokenRepository.getToken).toHaveBeenCalledWith(RECIPIENT_ID);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'fcm-token-abc',
        notification: { title: 'Vivia', body: 'Tienes un nuevo mensaje' },
        data: { conversationId: CONVERSATION_ID },
      }),
    );
  });

  it('does not send when the recipient has an active socket', async () => {
    connectionRegistry.isUserOnline.mockReturnValue(true);

    await service.notifyNewMessage(buildMessage());

    expect(tokenRepository.getToken).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('does not send when the recipient has no fcm_token', async () => {
    tokenRepository.getToken.mockResolvedValue(null);

    await service.notifyNewMessage(buildMessage());

    expect(send).not.toHaveBeenCalled();
  });

  it('does not send when push is disabled (no messaging)', async () => {
    firebaseAdmin.getMessaging.mockReturnValue(null);

    await service.notifyNewMessage(buildMessage());

    expect(conversationRepository.findById).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('swallows errors thrown by messaging.send (never rejects)', async () => {
    send.mockRejectedValue(new Error('registration-token-not-registered'));

    await expect(
      service.notifyNewMessage(buildMessage()),
    ).resolves.toBeUndefined();
  });
});
