import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SwitchTenantDto {
  @ApiProperty() @IsUUID() tenantId: string;
}
