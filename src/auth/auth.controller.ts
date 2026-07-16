import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { TenantRequired } from '../common/decorators/tenant-required.decorator';
import { AuthRequestMeta, AuthService } from './auth.service';
import { AuthResponseDto, AuthTenantDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { HttpRequestContext } from '../common/interfaces/http-request.interface';
import {
  EmailCodeLoginDto,
  PhoneCodeLoginDto,
  SendEmailCodeDto,
  SendPhoneCodeDto,
} from './dto/code-login.dto';
import { VerificationCodeService } from './verification-code.service';
import { SwitchTenantDto } from './dto/switch-tenant.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from './authenticated-user.interface';

@ApiTags('auth')
@Controller('auth')
@TenantRequired(false)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly verificationCodes: VerificationCodeService,
  ) {}

  @Post('login')
  @Public()
  @ApiResponse({ status: 201, type: AuthResponseDto })
  async login(@Body() dto: LoginDto, @Req() request: HttpRequestContext): Promise<AuthResponseDto> {
    return this.authService.login(dto, this.getRequestMeta(request));
  }

  @Post('login/email-code')
  @Public()
  @ApiResponse({ status: 201, type: AuthResponseDto })
  loginByEmailCode(
    @Body() dto: EmailCodeLoginDto,
    @Req() request: HttpRequestContext,
  ): Promise<AuthResponseDto> {
    return this.authService.loginByEmailCode(dto, this.getRequestMeta(request));
  }

  @Post('login/phone-code')
  @Public()
  @ApiResponse({ status: 201, type: AuthResponseDto })
  loginByPhoneCode(
    @Body() dto: PhoneCodeLoginDto,
    @Req() request: HttpRequestContext,
  ): Promise<AuthResponseDto> {
    return this.authService.loginByPhoneCode(dto, this.getRequestMeta(request));
  }

  @Post('verification/email')
  @Public()
  async sendEmailCode(@Body() dto: SendEmailCodeDto) {
    await this.verificationCodes.send('email', dto.email.toLowerCase().trim());
    return { sent: true as const };
  }

  @Post('verification/phone')
  @Public()
  async sendPhoneCode(@Body() dto: SendPhoneCodeDto) {
    await this.verificationCodes.send('phone', `${dto.countryCode}${dto.phone.replace(/\s/g, '')}`);
    return { sent: true as const };
  }

  @Post('switch-tenant')
  @ApiResponse({ status: 201, type: AuthResponseDto })
  async switchTenant(
    @Body() dto: SwitchTenantDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: HttpRequestContext,
  ): Promise<AuthResponseDto> {
    return this.authService.switchTenant(user.sub, dto.tenantId, this.getRequestMeta(request));
  }

  @Get('my-access')
  myAccess(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.myAccess(user.sub, user.tenantId);
  }

  @Get('my-tenants')
  @ApiResponse({ status: 200, type: [AuthTenantDto] })
  myTenants(@CurrentUser() user: AuthenticatedUser): Promise<AuthTenantDto[]> {
    return this.authService.myTenants(user.sub);
  }

  @Post('refresh')
  @Public()
  @ApiResponse({ status: 201, type: AuthResponseDto })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: HttpRequestContext,
  ): Promise<AuthResponseDto> {
    return this.authService.refresh(dto, this.getRequestMeta(request));
  }

  @Post('logout')
  @Public()
  async logout(@Body() dto: RefreshTokenDto): Promise<{ revoked: true }> {
    await this.authService.logout(dto);
    return { revoked: true };
  }

  private getRequestMeta(request: HttpRequestContext): AuthRequestMeta {
    const forwardedFor = request.headers['x-forwarded-for'];
    return {
      ipAddress:
        (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)?.split(',')[0]?.trim() ??
        request.ip ??
        request.socket?.remoteAddress,
      userAgent: Array.isArray(request.headers['user-agent'])
        ? request.headers['user-agent'][0]
        : request.headers['user-agent'],
    };
  }
}
