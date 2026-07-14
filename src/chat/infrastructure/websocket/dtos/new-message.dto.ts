import { IsString, IsUUID, Length } from 'class-validator';

export class NewMessageDto {
  @IsUUID()
  conversationId: string;

  @IsString()
  @Length(1, 4000)
  content: string;
}
