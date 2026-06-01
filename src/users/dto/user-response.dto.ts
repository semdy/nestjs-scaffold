import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../common/constants';
import { User } from '../user.entity';

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: ['admin', 'member', 'viewer'] })
  role: UserRole;

  static fromEntity(user: User): UserResponseDto {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
}
