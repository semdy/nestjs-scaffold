import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional() email?: string;
  @ApiPropertyOptional() phone?: string;
  @ApiPropertyOptional() countryCode?: string;
  @ApiProperty() name: string;
  @ApiProperty() active: boolean;
  @ApiProperty({ type: [String] }) roles: string[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  static fromEntity(user: {
    id: string;
    email: string | null;
    phone?: string | null;
    countryCode?: string | null;
    name: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    roleAssignments?: Array<{ role: { code: string } }>;
  }): UserResponseDto {
    return {
      id: user.id,
      ...(user.email ? { email: user.email } : {}),
      ...(user.phone ? { phone: user.phone } : {}),
      ...(user.countryCode ? { countryCode: user.countryCode } : {}),
      name: user.name,
      active: user.active,
      roles: user.roleAssignments?.map(({ role }) => role.code) ?? [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
