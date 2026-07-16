import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetRolePermissionsDto {
  @ApiProperty({
    type: [String],
    description: 'Complete set of enabled permission IDs; omitted permissions are switched off',
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionIds: string[];
}
