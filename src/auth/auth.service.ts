import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Cron } from '@nestjs/schedule';
import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import type { StringValue } from 'ms';
import { AccessService } from '../access/access.service';
import { LAST_LOGOUT_PREFIX } from '../common/constants';
import { parseTtlSeconds } from '../common/utils/parse-ttl';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TenancyContext } from '../tenancy/tenancy-context.service';
import { TenancyService } from '../tenancy/tenancy.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { AuthenticatedUser } from './authenticated-user.interface';
import { AuthResponseDto } from './dto/auth-response.dto';
import { EmailCodeLoginDto, PhoneCodeLoginDto } from './dto/code-login.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerificationCodeService } from './verification-code.service';

export interface AuthRequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

type AuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
  countryCode: string | null;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

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
    private readonly accessService: AccessService,
    private readonly verificationCodes: VerificationCodeService,
  ) {}

  async login(dto: LoginDto, meta: AuthRequestMeta = {}): Promise<AuthResponseDto> {
    const tenantId = await this.resolveRequestedTenant(dto.tenantSlug);
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (
      !user ||
      !user.active ||
      !user.passwordHash ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    )
      throw new UnauthorizedException('Invalid credentials');
    await this.assertMembership(user.id, tenantId);
    return this.issueAuthResponse(user, tenantId, meta);
  }

  async loginByEmailCode(dto: EmailCodeLoginDto, meta: AuthRequestMeta = {}) {
    const email = dto.email.toLowerCase().trim();
    await this.verificationCodes.consume('email', email, dto.code);
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) user = await this.registerVerifiedUser({ email, name: email });
    const tenantId = await this.resolveUserTenant(user.id, dto.tenantSlug);
    return this.issueAuthResponse(user, tenantId, meta);
  }

  async loginByPhoneCode(dto: PhoneCodeLoginDto, meta: AuthRequestMeta = {}) {
    const phone = dto.phone.replace(/\s/g, '');
    const target = `${dto.countryCode}${phone}`;
    await this.verificationCodes.consume('phone', target, dto.code);
    let user = await this.prisma.user.findUnique({
      where: { countryCode_phone: { countryCode: dto.countryCode, phone } },
    });
    if (!user)
      user = await this.registerVerifiedUser({ phone, countryCode: dto.countryCode, name: target });
    const tenantId = await this.resolveUserTenant(user.id, dto.tenantSlug);
    return this.issueAuthResponse(user, tenantId, meta);
  }

  async switchTenant(
    userId: string,
    tenantId: string,
    meta: AuthRequestMeta = {},
  ): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.active) throw new UnauthorizedException('User is inactive');
    await this.assertMembership(userId, tenantId);
    return this.issueAuthResponse(user, tenantId, meta);
  }

  async myAccess(userId: string, tenantId: string) {
    return this.accessService.getUserAccess(userId, tenantId);
  }

  async refresh(dto: RefreshTokenDto, meta: AuthRequestMeta = {}): Promise<AuthResponseDto> {
    const tokenHash = this.hashRefreshToken(dto.refreshToken);
    const storedToken = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
      include: { user: true },
    });
    if (!storedToken)
      throw this.refreshUnauthorized('REFRESH_TOKEN_INVALID', 'Refresh token is invalid');
    if (storedToken.expiresAt.getTime() <= Date.now()) {
      throw this.refreshUnauthorized('REFRESH_TOKEN_EXPIRED', 'Refresh token has expired');
    }
    if (!storedToken.user.active)
      throw this.refreshUnauthorized('USER_INACTIVE', 'User is inactive');
    await this.assertMembership(storedToken.userId, storedToken.tenantId);

    const response = await this.issueAuthResponse(storedToken.user, storedToken.tenantId, meta);
    const replacementHash = this.hashRefreshToken(response.refreshToken);
    const replacement = await this.prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: replacementHash },
      select: { id: true },
    });
    const rotated = await this.prisma.refreshToken.updateMany({
      where: { id: storedToken.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedByTokenId: replacement.id },
    });
    if (rotated.count !== 1) {
      await this.prisma.refreshToken.update({
        where: { id: replacement.id },
        data: { revokedAt: new Date() },
      });
      throw this.refreshUnauthorized('REFRESH_TOKEN_INVALID', 'Refresh token was already used');
    }
    await this.revokeAccessTokens(storedToken.userId);
    return response;
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    const tokenHash = this.hashRefreshToken(dto.refreshToken);
    const storedToken = await this.prisma.refreshToken.findFirst({ where: { tokenHash } });
    if (storedToken && !storedToken.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });
      await this.revokeAccessTokens(storedToken.userId);
    }
  }

  private async registerVerifiedUser(input: {
    email?: string;
    phone?: string;
    countryCode?: string;
    name: string;
  }) {
    const tenant = await this.tenancyService.bootstrapDefaultTenant();
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: input });
      await tx.tenantMembership.create({ data: { userId: user.id, tenantId: tenant.id } });
      const memberRole = await tx.role.findFirstOrThrow({
        where: { tenantId: null, code: 'member', enabled: true },
        select: { id: true },
      });
      await tx.userRoleAssignment.create({
        data: { userId: user.id, tenantId: tenant.id, roleId: memberRole.id },
      });
      return user;
    });
  }

  private async resolveRequestedTenant(tenantSlug?: string): Promise<string> {
    let tenantId = this.tenancyContext.tenantId;
    if (!tenantId && tenantSlug)
      tenantId = (await this.tenancyService.resolveTenantId(tenantSlug)) ?? undefined;
    if (!tenantId) throw new UnauthorizedException('Tenant is required');
    return tenantId;
  }

  private async resolveUserTenant(userId: string, tenantSlug?: string): Promise<string> {
    if (this.tenancyContext.tenantId || tenantSlug) {
      const tenantId = await this.resolveRequestedTenant(tenantSlug);
      await this.assertMembership(userId, tenantId);
      return tenantId;
    }
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { userId, active: true, tenant: { active: true } },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) throw new ForbiddenException('User has no active tenant membership');
    return membership.tenantId;
  }

  private async assertMembership(userId: string, tenantId: string): Promise<void> {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { userId, tenantId, active: true, tenant: { active: true } },
    });
    if (!membership) throw new ForbiddenException('User is not a member of this tenant');
  }

  private async issueAuthResponse(user: AuthUser, tenantId: string, meta: AuthRequestMeta) {
    const access = await this.accessService.getUserAccess(user.id, tenantId);
    const { plainToken: refreshToken } = await this.createRefreshToken(user.id, tenantId, meta);
    return {
      accessToken: await this.createAccessToken(user, tenantId),
      refreshToken,
      user: UserResponseDto.fromEntity({
        ...user,
        roleAssignments: access.roles.map((code) => ({ role: { code } })),
      }),
      roles: access.roles,
      permissions: access.permissions,
    };
  }

  private createAccessToken(user: AuthUser, tenantId: string): Promise<string> {
    const payload: AuthenticatedUser = {
      sub: user.id,
      tenantId,
      ...(user.email ? { email: user.email } : {}),
      active: user.active,
    };
    return this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '2h') as StringValue,
    });
  }

  private async createRefreshToken(userId: string, tenantId: string, meta: AuthRequestMeta) {
    const plainToken = randomBytes(64).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.configService.get<number>('REFRESH_TOKEN_EXPIRES_IN_DAYS', 30) * 86400_000,
    );
    const record = await this.prisma.refreshToken.create({
      data: { tenantId, userId, tokenHash: this.hashRefreshToken(plainToken), expiresAt, ...meta },
    });
    return { plainToken, id: record.id };
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshUnauthorized(code: string, message: string) {
    return new UnauthorizedException({ code, message });
  }

  private async revokeAccessTokens(userId: string): Promise<void> {
    const ttlSeconds = parseTtlSeconds(this.configService.get<string>('JWT_EXPIRES_IN', '2h'));
    await this.redis.set(`${LAST_LOGOUT_PREFIX}${userId}`, String(Math.floor(Date.now() / 1000)), {
      ttlSeconds,
    });
  }

  @Cron('0 3 * * *')
  async cleanupExpiredTokens(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 86400_000);
    const result = await this.prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { not: null, lt: cutoff } }] },
    });
    if (result.count) this.logger.log(`Cleaned up ${result.count} expired refresh tokens`);
  }
}
