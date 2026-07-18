import { IsString, IsUUID, Length } from 'class-validator';

export class EditMessageDto {
  @IsUUID()
  messageId: string;

  @IsString()
  @Length(1, 4000)
  content: string;
}
