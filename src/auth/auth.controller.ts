import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { TenantRequired } from '../common/decorators/tenant-required.decorator';
import { AuthRequestMeta, AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

interface RequestMetaSource {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @TenantRequired()
  async login(@Body() dto: LoginDto, @Req() request: RequestMetaSource): Promise<AuthResponseDto> {
    return this.authService.login(dto, this.getRequestMeta(request));
  }

  @Post('refresh')
  @Public()
  @TenantRequired(false)
  async refresh(@Body() dto: RefreshTokenDto, @Req() request: RequestMetaSource): Promise<AuthResponseDto> {
    return this.authService.refresh(dto, this.getRequestMeta(request));
  }

  @Post('logout')
  @Public()
  @TenantRequired(false)
  async logout(@Body() dto: RefreshTokenDto): Promise<{ revoked: true }> {
    await this.authService.logout(dto);
    return { revoked: true };
  }

  private getRequestMeta(request: RequestMetaSource): AuthRequestMeta {
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
