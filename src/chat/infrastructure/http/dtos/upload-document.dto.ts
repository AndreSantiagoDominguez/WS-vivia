import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadDocumentDto {
  @ApiPropertyOptional({
    maxLength: 4000,
    description: 'Texto opcional que acompaña al documento.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  caption?: string;
}
