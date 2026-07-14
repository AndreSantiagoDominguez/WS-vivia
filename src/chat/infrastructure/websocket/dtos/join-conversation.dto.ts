import { IsUUID } from 'class-validator';

export class JoinConversationDto {
  @IsUUID()
  conversationId: string;
}
