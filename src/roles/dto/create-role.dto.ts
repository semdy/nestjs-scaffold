import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'editor' })
  @Matches(/^[a-z][a-z0-9_]{1,49}$/)
  code: string;

  @ApiProperty({ example: 'Editor' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[];
}
