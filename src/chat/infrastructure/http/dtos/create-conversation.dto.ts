import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
}
