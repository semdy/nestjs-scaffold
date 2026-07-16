import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleRolePermissionDto {
  @ApiProperty({ description: 'Whether this permission is granted to the role' })
  @IsBoolean()
  enabled: boolean;
}
