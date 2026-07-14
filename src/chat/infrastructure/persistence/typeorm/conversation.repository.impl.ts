import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from '../../../domain/entities/conversation.entity';
import {
  IConversationRepository,
  NewConversationData,
} from '../../../domain/repositories/conversation.repository';
import { ConversationOrmEntity } from './conversation.orm-entity';
import { conversationToDomain } from './mappers';

@Injectable()
export class TypeOrmConversationRepository implements IConversationRepository {
  constructor(
    @InjectRepository(ConversationOrmEntity)
    private readonly repository: Repository<ConversationOrmEntity>,
  ) {}

  async findById(id: string): Promise<Conversation | null> {
    const found = await this.repository.findOneBy({ id });
    return found ? conversationToDomain(found) : null;
  }

  async findByParticipants(
    participantOneId: string,
    participantTwoId: string,
  ): Promise<Conversation | null> {
    const found = await this.repository.findOneBy({
      participantOneId,
      participantTwoId,
    });
    return found ? conversationToDomain(found) : null;
  }

  async create(data: NewConversationData): Promise<Conversation> {
    const created = this.repository.create({
      participantOneId: data.participantOneId,
      participantOneRole: data.participantOneRole,
      participantTwoId: data.participantTwoId,
      participantTwoRole: data.participantTwoRole,
      propertyId: data.propertyId,
      propertyTitle: data.propertyTitle,
      lastMessageAt: null,
    });
    const saved = await this.repository.save(created);
    return conversationToDomain(saved);
  }

  async findAllForUser(userId: string): Promise<Conversation[]> {
    const found = await this.repository
      .createQueryBuilder('conversation')
      .where('conversation.participant_one_id = :userId', { userId })
      .orWhere('conversation.participant_two_id = :userId', { userId })
      .orderBy('conversation.last_message_at', 'DESC', 'NULLS LAST')
      .addOrderBy('conversation.created_at', 'DESC')
      .getMany();
    return found.map(conversationToDomain);
  }

  async updateLastMessageAt(
    conversationId: string,
    lastMessageAt: Date,
  ): Promise<void> {
    await this.repository.update({ id: conversationId }, { lastMessageAt });
  }

  async reassignParticipants(
    conversationId: string,
    participantOneId: string,
    participantOneRole: string,
    participantTwoId: string,
    participantTwoRole: string,
  ): Promise<void> {
    await this.repository.update(
      { id: conversationId },
      {
        participantOneId,
        participantOneRole,
        participantTwoId,
        participantTwoRole,
      },
    );
  }

  async delete(conversationId: string): Promise<void> {
    await this.repository.delete({ id: conversationId });
  }
}
