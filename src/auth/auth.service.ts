import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Cron } from '@nestjs/schedule';
import bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'node:crypto';

import type { StringValue } from 'ms';
import { UserRole, LAST_LOGOUT_PREFIX } from '../common/constants';
import { TenancyContext } from '../tenancy/tenancy-context.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TenancyService } from '../tenancy/tenancy.service';
import { UsersService } from '../users/users.service';
import { AuthenticatedUser } from './authenticated-user.interface';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { parseTtlSeconds } from '../common/utils/parse-ttl';

export interface AuthRequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly tenancyContext: TenancyContext,
    private readonly tenancyService: TenancyService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async login(dto: LoginDto, meta: AuthRequestMeta = {}): Promise<AuthResponseDto> {
    let tenantId = this.tenancyContext.tenantId;

    if (!tenantId && dto.tenantSlug) {
      tenantId = (await this.tenancyService.resolveTenantId(dto.tenantSlug)) ?? undefined;
    }

    if (!tenantId) {
      throw new UnauthorizedException(
        'Tenant is required. Provide x-tenant-id header or tenantSlug in body.',
      );
    }

    const user = await this.usersService.findByEmailWithPassword(tenantId, dto.email);

    if (!user || !user.active || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { plainToken: refreshToken } = await this.createRefreshToken(user, meta);

    return {
      accessToken: await this.createAccessToken(user),
      refreshToken,
      user: UserResponseDto.fromEntity(user),
    };
  }

  async refresh(dto: RefreshTokenDto, meta: AuthRequestMeta = {}): Promise<AuthResponseDto> {
    const tokenHash = this.hashRefreshToken(dto.refreshToken);
    const storedToken = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
      include: { user: true },
    });

    if (!storedToken) {
      throw this.refreshUnauthorized('REFRESH_TOKEN_INVALID', 'Refresh token is invalid');
    }

    if (storedToken.expiresAt.getTime() <= Date.now()) {
      throw this.refreshUnauthorized('REFRESH_TOKEN_EXPIRED', 'Refresh token has expired');
    }

    if (!storedToken.user.active) {
      throw this.refreshUnauthorized('USER_INACTIVE', 'User is inactive');
    }

    const { plainToken: nextRefreshToken, id: replacementId } = await this.createRefreshToken(
      storedToken.user,
      meta,
    );

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date(), replacedByTokenId: replacementId },
    });

    // 吊销旧 access token：记录刷新时间，JWT 策略会拒绝 iat 早于此时间的 access token
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '2h');
    const ttlSeconds = parseTtlSeconds(expiresIn);
    await this.redis.set(
      `${LAST_LOGOUT_PREFIX}${storedToken.userId}`,
      String(Math.floor(Date.now() / 1000)),
      { ttlSeconds },
    );

    return {
      accessToken: await this.createAccessToken(storedToken.user),
      refreshToken: nextRefreshToken,
      user: UserResponseDto.fromEntity(storedToken.user),
    };
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    const tokenHash = this.hashRefreshToken(dto.refreshToken);
    const storedToken = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      select: { userId: true, revokedAt: true },
    });
    if (storedToken && !storedToken.revokedAt) {
      // 吊销 refresh token
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // Redis 记录最后登出时间，access token 的 iat 早于此时间的均视为已吊销
      const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '2h');
      const ttlSeconds = parseTtlSeconds(expiresIn);
      await this.redis.set(
        `${LAST_LOGOUT_PREFIX}${storedToken.userId}`,
        String(Math.floor(Date.now() / 1000)),
        { ttlSeconds },
      );
    }
  }

  private async createAccessToken(user: {
    id: string;
    tenantId: string;
    email: string;
    role: string;
    active: boolean;
  }): Promise<string> {
    const payload: AuthenticatedUser = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role as UserRole,
      active: user.active,
    };

    return this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '2h') as StringValue,
    });
  }

  private async createRefreshToken(
    user: { id: string; tenantId: string },
    meta: AuthRequestMeta,
  ): Promise<{ plainToken: string; id: string }> {
    const refreshToken = randomBytes(64).toString('base64url');
    const expiresInDays = this.configService.get<number>('REFRESH_TOKEN_EXPIRES_IN_DAYS', 30);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const record = await this.prisma.refreshToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });

    return { plainToken: refreshToken, id: record.id };
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private refreshUnauthorized(code: string, message: string): UnauthorizedException {
    return new UnauthorizedException({ code, message });
  }

  @Cron('0 3 * * *') // 每天凌晨3点执行
  async cleanupExpiredTokens(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 86400_000);
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { not: null, lt: cutoff } }],
      },
    });
    if (result.count) {
      this.logger.log(`Cleaned up ${result.count} expired refresh tokens`);
    }
  }
}
