import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Message } from '../../../domain/entities/message.entity';
import {
  IMessageRepository,
  ListMessagesOptions,
  NewMessageData,
} from '../../../domain/repositories/message.repository';
import { MessageOrmEntity } from './message.orm-entity';
import { messageToDomain } from './mappers';

@Injectable()
export class TypeOrmMessageRepository implements IMessageRepository {
  constructor(
    @InjectRepository(MessageOrmEntity)
    private readonly repository: Repository<MessageOrmEntity>,
  ) {}

  async create(data: NewMessageData): Promise<Message> {
    const created = this.repository.create({
      conversationId: data.conversationId,
      senderId: data.senderId,
      type: data.type,
      content: data.content,
      documentUrl: data.documentUrl ?? null,
      documentName: data.documentName ?? null,
      documentMimeType: data.documentMimeType ?? null,
      documentSizeBytes: data.documentSizeBytes ?? null,
      readAt: null,
    });
    const saved = await this.repository.save(created);
    return messageToDomain(saved);
  }

  async findByConversationId(
    conversationId: string,
    options: ListMessagesOptions,
  ): Promise<Message[]> {
    const found = await this.repository.find({
      where: {
        conversationId,
        ...(options.before ? { createdAt: LessThan(options.before) } : {}),
      },
      order: { createdAt: 'DESC' },
      take: options.limit,
    });
    return found.map(messageToDomain);
  }

  async markAsReadForRecipient(
    conversationId: string,
    readerUserId: string,
  ): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(MessageOrmEntity)
      .set({ readAt: () => 'now()' })
      .where('conversation_id = :conversationId', { conversationId })
      .andWhere('sender_id != :readerUserId', { readerUserId })
      .andWhere('read_at IS NULL')
      .execute();
    return result.affected ?? 0;
  }

  async reassignConversation(
    oldConversationId: string,
    newConversationId: string,
  ): Promise<void> {
    await this.repository.update(
      { conversationId: oldConversationId },
      { conversationId: newConversationId },
    );
  }

  async reassignSender(oldUserId: string, newUserId: string): Promise<void> {
    await this.repository.update(
      { senderId: oldUserId },
      { senderId: newUserId },
    );
  }
}
