import { Conversation } from '../../../domain/entities/conversation.entity';
import { Message, MessageType } from '../../../domain/entities/message.entity';
import { ConversationOrmEntity } from './conversation.orm-entity';
import { MessageOrmEntity } from './message.orm-entity';

export function conversationToDomain(orm: ConversationOrmEntity): Conversation {
  return new Conversation({
    id: orm.id,
    participantOneId: orm.participantOneId,
    participantOneRole: orm.participantOneRole,
    participantTwoId: orm.participantTwoId,
    participantTwoRole: orm.participantTwoRole,
    propertyId: orm.propertyId,
    propertyTitle: orm.propertyTitle,
    lastMessageAt: orm.lastMessageAt,
    createdAt: orm.createdAt,
    updatedAt: orm.updatedAt,
  });
}

export function messageToDomain(orm: MessageOrmEntity): Message {
  return new Message({
    id: orm.id,
    conversationId: orm.conversationId,
    senderId: orm.senderId,
    type: orm.type as MessageType,
    content: orm.content,
    documentUrl: orm.documentUrl,
    documentName: orm.documentName,
    documentMimeType: orm.documentMimeType,
    documentSizeBytes: orm.documentSizeBytes,
    readAt: orm.readAt,
    createdAt: orm.createdAt,
    updatedAt: orm.updatedAt,
  });
}
