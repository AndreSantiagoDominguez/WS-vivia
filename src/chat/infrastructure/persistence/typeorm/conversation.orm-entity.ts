import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MessageOrmEntity } from './message.orm-entity';

@Entity({ schema: 'chat', name: 'conversations' })
@Index(['participantOneId', 'participantTwoId'], { unique: true })
export class ConversationOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'participant_one_id', type: 'uuid' })
  participantOneId: string;

  @Column({ name: 'participant_one_role', type: 'varchar' })
  participantOneRole: string;

  @Column({ name: 'participant_two_id', type: 'uuid' })
  participantTwoId: string;

  @Column({ name: 'participant_two_role', type: 'varchar' })
  participantTwoRole: string;

  @Column({ name: 'property_id', type: 'uuid', nullable: true })
  propertyId: string | null;

  @Column({ name: 'property_title', type: 'varchar', nullable: true })
  propertyTitle: string | null;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => MessageOrmEntity, (message) => message.conversation)
  messages: MessageOrmEntity[];
}
