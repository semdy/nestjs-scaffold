import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetRolePermissionsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionIds: string[];
}
