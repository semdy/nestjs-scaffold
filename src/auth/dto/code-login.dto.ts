import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class EmailCodeLoginDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @Length(6, 6) code: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tenantSlug?: string;
}

export class PhoneCodeLoginDto {
  @ApiProperty({ example: '+86' }) @Matches(/^\+[1-9]\d{0,3}$/) countryCode: string;
  @ApiProperty() @Matches(/^\d{6,20}$/) phone: string;
  @ApiProperty() @Length(6, 6) code: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tenantSlug?: string;
}

export class SendEmailCodeDto {
  @ApiProperty() @IsEmail() email: string;
}

export class SendPhoneCodeDto {
  @ApiProperty({ example: '+86' }) @Matches(/^\+[1-9]\d{0,3}$/) countryCode: string;
  @ApiProperty() @Matches(/^\d{6,20}$/) @MaxLength(20) phone: string;
}
