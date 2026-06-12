import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({ example: 'acme-corp' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  slug: string;

  @ApiProperty({ example: 'Acme Corporation' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;
}
