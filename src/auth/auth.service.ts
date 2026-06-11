import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'node:crypto';
import type { StringValue } from 'ms';
import { IsNull, LessThan, Repository } from 'typeorm';
import { TenancyContext } from '../tenancy/tenancy-context.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';
import { AuthenticatedUser } from './authenticated-user.interface';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RefreshToken } from './refresh-token.entity';

export interface AuthRequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

const LAST_LOGOUT_PREFIX = 'lastLogoutAt:';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly tenancyContext: TenancyContext,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async login(dto: LoginDto, meta: AuthRequestMeta = {}): Promise<AuthResponseDto> {
    const tenantId = this.tenancyContext.requireTenantId();
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
    const storedToken = await this.refreshTokens.findOne({
      where: { tokenHash, revokedAt: IsNull() },
      relations: { user: true },
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

    const { plainToken: nextRefreshToken, entity: replacement } = await this.createRefreshToken(
      storedToken.user,
      meta,
    );

    storedToken.revokedAt = new Date();
    storedToken.replacedByTokenId = replacement?.id;
    await this.refreshTokens.save(storedToken);

    return {
      accessToken: await this.createAccessToken(storedToken.user),
      refreshToken: nextRefreshToken,
      user: UserResponseDto.fromEntity(storedToken.user),
    };
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    const tokenHash = this.hashRefreshToken(dto.refreshToken);
    const storedToken = await this.refreshTokens.findOne({
      where: { tokenHash },
      select: ['userId', 'revokedAt'],
    });
    if (storedToken && !storedToken.revokedAt) {
      // 吊销 refresh token
      await this.refreshTokens.update(
        { tokenHash, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      // Redis 记录最后登出时间，access token 的 iat 早于此时间的均视为已吊销
      const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '2h');
      const ttlSeconds = this.parseTtlSeconds(expiresIn);
      await this.redis.set(
        `${LAST_LOGOUT_PREFIX}${storedToken.userId}`,
        String(Math.floor(Date.now() / 1000)),
        { ttlSeconds },
      );
    }
  }

  private async createAccessToken(user: User): Promise<string> {
    const payload: AuthenticatedUser = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      active: user.active,
    };

    return this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '2h') as StringValue,
    });
  }

  private async createRefreshToken(
    user: User,
    meta: AuthRequestMeta,
  ): Promise<{ plainToken: string; entity: RefreshToken }> {
    const refreshToken = randomBytes(64).toString('base64url');
    const expiresInDays = this.configService.get<number>('REFRESH_TOKEN_EXPIRES_IN_DAYS', 30);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const entity = await this.refreshTokens.save(
      this.refreshTokens.create({
        tenantId: user.tenantId,
        userId: user.id,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      }),
    );

    return { plainToken: refreshToken, entity };
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private refreshUnauthorized(code: string, message: string): UnauthorizedException {
    return new UnauthorizedException({ code, message });
  }

  private parseTtlSeconds(expiresIn: string): number {
    const value = parseInt(expiresIn, 10);
    if (expiresIn.endsWith('h')) return value * 3600;
    if (expiresIn.endsWith('d')) return value * 86400;
    if (expiresIn.endsWith('m')) return value * 60;
    return value; // 默认秒
  }

  @Cron('0 0 3 * * *') // 每天凌晨 3 点
  async cleanupExpiredTokens(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 86400_000);
    const result = await this.refreshTokens.delete({
      expiresAt: LessThan(cutoff),
    });
    if (result.affected) {
      this.logger.log(`Cleaned up ${result.affected} expired refresh tokens`);
    }
  }
}
