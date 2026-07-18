import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Forma exacta de lo que `ChatController` devuelve para una conversación — ver `toConversationResponse`. */
export class ConversationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  participantOneId: string;

  @ApiProperty({ enum: ['ROLE_LESSOR', 'ROLE_LESSEE'] })
  participantOneRole: string;

  @ApiProperty({ format: 'uuid' })
  participantTwoId: string;

  @ApiProperty({ enum: ['ROLE_LESSOR', 'ROLE_LESSEE'] })
  participantTwoRole: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  propertyId: string | null;

  @ApiPropertyOptional({ nullable: true })
  propertyTitle: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastMessageAt: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Preview del mensaje más reciente real — null si no hay mensajes, o si el más reciente se borró.',
  })
  lastMessageContent: string | null;

  @ApiPropertyOptional({ enum: ['text', 'document'], nullable: true })
  lastMessageType: 'text' | 'document' | null;

  @ApiProperty({
    description:
      'Mensajes de esta conversación que no mandó el usuario autenticado y todavía no tienen readAt.',
  })
  unreadCount: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}
