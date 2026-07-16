import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ACCESS_CACHE_PREFIX, SYSTEM_ADMIN_ROLE } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface UserAccess {
  roles: string[];
  permissions: string[];
}

@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getUserAccess(userId: string, tenantId: string): Promise<UserAccess> {
    const cacheKey = this.cacheKey(tenantId, userId);
    const cached = await this.redis.getJson<UserAccess>(cacheKey);
    if (cached) return cached;

    const membership = await this.prisma.tenantMembership.findFirst({
      where: { userId, tenantId, active: true, user: { active: true }, tenant: { active: true } },
      select: { userId: true },
    });
    if (!membership) throw new UnauthorizedException('User is not an active member of tenant');

    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: {
        userId,
        tenantId,
        role: { enabled: true, OR: [{ tenantId: null }, { tenantId }] },
      },
      select: {
        role: {
          select: {
            code: true,
            builtIn: true,
            tenantId: true,
            permissions: {
              where: { permission: { enabled: true } },
              select: { permission: { select: { code: true } } },
            },
          },
        },
      },
    });
    const roles = [...new Set(assignments.map(({ role }) => role.code))].sort();
    const isSystemAdmin = assignments.some(
      ({ role }) => role.code === SYSTEM_ADMIN_ROLE && role.builtIn && role.tenantId === null,
    );
    const permissions = isSystemAdmin
      ? (
          await this.prisma.permission.findMany({
            where: { enabled: true },
            select: { code: true },
            orderBy: { code: 'asc' },
          })
        ).map(({ code }) => code)
      : [
          ...new Set(
            assignments.flatMap(({ role }) =>
              role.permissions.map(({ permission }) => permission.code),
            ),
          ),
        ].sort();

    const access = { roles, permissions };
    await this.redis.setJson(cacheKey, access, { ttlSeconds: 300 });
    return access;
  }

  async invalidateUser(userId: string, tenantId?: string): Promise<void> {
    if (tenantId) {
      await this.redis.delete(this.cacheKey(tenantId, userId));
      return;
    }
    await this.redis.deleteByPattern(`${ACCESS_CACHE_PREFIX}*:${userId}`);
  }

  async invalidateTenant(tenantId: string): Promise<void> {
    await this.redis.deleteByPattern(`${ACCESS_CACHE_PREFIX}${tenantId}:*`);
  }

  async invalidateAll(): Promise<void> {
    await this.redis.deleteByPattern(`${ACCESS_CACHE_PREFIX}*`);
  }

  private cacheKey(tenantId: string, userId: string): string {
    return `${ACCESS_CACHE_PREFIX}${tenantId}:${userId}`;
  }
}
