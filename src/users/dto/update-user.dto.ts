import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '../../common/constants';

type TenantAssignableRole = Exclude<UserRole, 'system_admin'>;

export class UpdateUserDto {
  @ApiProperty({ example: 'ada@example.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'Ada Lovelace', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ minLength: 8, maxLength: 128, required: false })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @ApiProperty({ enum: ['admin', 'member', 'viewer'], required: false })
  @IsOptional()
  @IsIn(['admin', 'member', 'viewer'])
  role?: TenantAssignableRole;
}
