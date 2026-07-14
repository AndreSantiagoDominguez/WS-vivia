import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Forma exacta de lo que `ChatController` devuelve para un mensaje — ver `toMessageResponse`. */
export class MessageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  conversationId: string;

  @ApiProperty({ format: 'uuid' })
  senderId: string;

  @ApiProperty({ enum: ['text', 'document'] })
  type: 'text' | 'document';

  @ApiPropertyOptional({
    maxLength: 4000,
    nullable: true,
    description: 'Texto del mensaje, o caption opcional de un documento.',
  })
  content: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Solo presente cuando type === "document".',
  })
  documentUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  documentName: string | null;

  @ApiPropertyOptional({ nullable: true })
  documentMimeType: string | null;

  @ApiPropertyOptional({ nullable: true })
  documentSizeBytes: number | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  readAt: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}
