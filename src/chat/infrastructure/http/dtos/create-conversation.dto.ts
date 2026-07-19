import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({
    format: 'uuid',
    example: '0ecc77a7-2420-4a31-a74e-db070dbad6b9',
  })
  @IsUUID()
  otherUserId: string;

  @ApiProperty({ enum: ['ROLE_LESSOR', 'ROLE_LESSEE'] })
  @IsIn(['ROLE_LESSOR', 'ROLE_LESSEE'])
  otherUserRole: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({ maxLength: 200, example: 'Depto en Palermo' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  propertyTitle?: string;

  @ApiPropertyOptional({
    maxLength: 200,
    description:
      'Nombre del usuario autenticado (el que crea la conversación) — se guarda en el cache de perfiles del chat, ver GET /conversations.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  requesterName?: string;

  @ApiPropertyOptional({
    description: 'URL de la foto de perfil del usuario autenticado.',
  })
  @IsOptional()
  @IsUrl()
  requesterPhotoUrl?: string;

  @ApiPropertyOptional({
    maxLength: 200,
    description:
      'Nombre del otro participante — igual se guarda en el cache de perfiles.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  otherUserName?: string;

  @ApiPropertyOptional({
    description: 'URL de la foto de perfil del otro participante.',
  })
  @IsOptional()
  @IsUrl()
  otherUserPhotoUrl?: string;
}
