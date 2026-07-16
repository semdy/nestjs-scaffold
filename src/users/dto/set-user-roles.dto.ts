import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetUserRolesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  roleIds: string[];
}
