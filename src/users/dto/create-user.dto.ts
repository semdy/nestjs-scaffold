import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '../../common/constants';

export class CreateUserDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  name: string;

  @ApiProperty({ minLength: 8, example: 'change-me-123' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: ['admin', 'member', 'viewer'], required: false })
  @IsOptional()
  @IsIn(['admin', 'member', 'viewer'])
  role?: UserRole;
}
