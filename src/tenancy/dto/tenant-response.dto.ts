import { ApiProperty } from '@nestjs/swagger';

export class TenantResponseDto {
  @ApiProperty({ example: '019a2b3c-4d5e-6f7a-8b9c-0d1e2f3a4b5c' })
  id: string;

  @ApiProperty({ example: 'default' })
  slug: string;

  @ApiProperty({ example: 'Default Tenant' })
  name: string;

  @ApiProperty({ example: true })
  active: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromEntity(entity: {
    id: string;
    slug: string;
    name: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): TenantResponseDto {
    const dto = new TenantResponseDto();
    dto.id = entity.id;
    dto.slug = entity.slug;
    dto.name = entity.name;
    dto.active = entity.active;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
