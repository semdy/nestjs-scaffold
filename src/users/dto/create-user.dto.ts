import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  name: string;

  @ApiProperty({ minLength: 8, maxLength: 128, example: 'change-me-123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ type: [String], required: false, description: 'Role IDs in the current tenant' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  roleIds?: string[];
}
