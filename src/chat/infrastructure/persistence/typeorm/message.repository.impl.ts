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

  async findById(id: string): Promise<Message | null> {
    const found = await this.repository.findOneBy({ id });
    return found ? messageToDomain(found) : null;
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

  async hardDelete(id: string): Promise<void> {
    await this.repository.delete({ id });
  }

  async softDelete(id: string, deletedAt: Date): Promise<Message> {
    await this.repository.update(
      { id },
      {
        content: null,
        documentUrl: null,
        documentName: null,
        documentMimeType: null,
        documentSizeBytes: null,
        deletedAt,
      },
    );
    const updated = await this.repository.findOneByOrFail({ id });
    return messageToDomain(updated);
  }

  async updateContent(
    id: string,
    content: string,
    editedAt: Date,
  ): Promise<Message> {
    await this.repository.update({ id }, { content, editedAt });
    const updated = await this.repository.findOneByOrFail({ id });
    return messageToDomain(updated);
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

  async countDistinctConversationsBySender(senderId: string): Promise<number> {
    const count = await this.repository
      .createQueryBuilder('message')
      .select('COUNT(DISTINCT message.conversation_id)', 'count')
      .where('message.sender_id = :senderId', { senderId })
      .getRawOne<{ count: string }>();
    return Number(count?.count ?? 0);
  }

  async hasSenderMessagedInConversation(
    conversationId: string,
    senderId: string,
  ): Promise<boolean> {
    const existing = await this.repository.findOne({
      where: { conversationId, senderId },
      select: { id: true },
    });
    return existing !== null;
  }
}
