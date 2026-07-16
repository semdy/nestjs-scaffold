import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({ example: 'document.publish' })
  @Matches(/^[a-z][a-z0-9_.:]{1,99}$/)
  code: string;

  @ApiProperty({ example: '发布文档' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
