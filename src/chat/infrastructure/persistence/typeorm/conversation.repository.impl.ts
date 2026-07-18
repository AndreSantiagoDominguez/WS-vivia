import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from '../../../domain/entities/conversation.entity';
import { MessageType } from '../../../domain/entities/message.entity';
import {
  ConversationSummary,
  IConversationRepository,
  NewConversationData,
} from '../../../domain/repositories/conversation.repository';
import { ConversationOrmEntity } from './conversation.orm-entity';
import { conversationToDomain } from './mappers';

interface ConversationSummaryRow {
  id: string;
  participant_one_id: string;
  participant_one_role: string;
  participant_two_id: string;
  participant_two_role: string;
  property_id: string | null;
  property_title: string | null;
  last_message_at: Date | null;
  hidden_for_participant_one_at: Date | null;
  hidden_for_participant_two_at: Date | null;
  created_at: Date;
  updated_at: Date;
  last_message_content: string | null;
  last_message_type: string | null;
  unread_count: number;
}

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
      .where(
        '(conversation.participant_one_id = :userId AND (conversation.hidden_for_participant_one_at IS NULL OR (conversation.last_message_at IS NOT NULL AND conversation.last_message_at > conversation.hidden_for_participant_one_at)))',
        { userId },
      )
      .orWhere(
        '(conversation.participant_two_id = :userId AND (conversation.hidden_for_participant_two_at IS NULL OR (conversation.last_message_at IS NOT NULL AND conversation.last_message_at > conversation.hidden_for_participant_two_at)))',
        { userId },
      )
      .orderBy('conversation.last_message_at', 'DESC', 'NULLS LAST')
      .addOrderBy('conversation.created_at', 'DESC')
      .getMany();
    return found.map(conversationToDomain);
  }

  /**
   * Query cruda (no query builder) por los `LEFT JOIN LATERAL`: cada
   * conversación se cruza con su mensaje más reciente real (para el preview)
   * y con el conteo de mensajes sin leer que no mandó `userId`. Nunca se
   * cachea/desnormaliza esto — siempre refleja el estado actual de los
   * mensajes, incluyendo ediciones y borrados.
   */
  async findConversationSummariesForUser(
    userId: string,
  ): Promise<ConversationSummary[]> {
    const rows: ConversationSummaryRow[] = await this.repository.query(
      `
      SELECT
        c.id, c.participant_one_id, c.participant_one_role,
        c.participant_two_id, c.participant_two_role,
        c.property_id, c.property_title, c.last_message_at,
        c.hidden_for_participant_one_at, c.hidden_for_participant_two_at,
        c.created_at, c.updated_at,
        lm.content AS last_message_content,
        lm.type AS last_message_type,
        COALESCE(uc.count, 0) AS unread_count
      FROM "chat"."conversations" c
      LEFT JOIN LATERAL (
        SELECT content, type
        FROM "chat"."messages" m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) lm ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS count
        FROM "chat"."messages" m2
        WHERE m2.conversation_id = c.id
          AND m2.sender_id != $1
          AND m2.read_at IS NULL
          AND m2.deleted_at IS NULL
      ) uc ON true
      WHERE
        (c.participant_one_id = $1 AND (c.hidden_for_participant_one_at IS NULL OR (c.last_message_at IS NOT NULL AND c.last_message_at > c.hidden_for_participant_one_at)))
        OR
        (c.participant_two_id = $1 AND (c.hidden_for_participant_two_at IS NULL OR (c.last_message_at IS NOT NULL AND c.last_message_at > c.hidden_for_participant_two_at)))
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
      `,
      [userId],
    );

    return rows.map((row) => ({
      conversation: new Conversation({
        id: row.id,
        participantOneId: row.participant_one_id,
        participantOneRole: row.participant_one_role,
        participantTwoId: row.participant_two_id,
        participantTwoRole: row.participant_two_role,
        propertyId: row.property_id,
        propertyTitle: row.property_title,
        lastMessageAt: row.last_message_at,
        hiddenForParticipantOneAt: row.hidden_for_participant_one_at,
        hiddenForParticipantTwoAt: row.hidden_for_participant_two_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
      lastMessageContent: row.last_message_content,
      lastMessageType: row.last_message_type as MessageType | null,
      unreadCount: row.unread_count,
    }));
  }

  async hideForParticipant(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    // Los fragmentos `() => '...'` son SQL crudo, así que `userId` se manda
    // como parámetro nombrado (`:userId`) en vez de interpolarlo en el
    // string — evita inyección SQL aunque ya venga validado como UUID.
    await this.repository
      .createQueryBuilder()
      .update(ConversationOrmEntity)
      .set({
        hiddenForParticipantOneAt: () =>
          `CASE WHEN participant_one_id = :userId THEN now() ELSE hidden_for_participant_one_at END`,
        hiddenForParticipantTwoAt: () =>
          `CASE WHEN participant_two_id = :userId THEN now() ELSE hidden_for_participant_two_at END`,
      })
      .where('id = :conversationId', { conversationId })
      .setParameter('userId', userId)
      .execute();
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
