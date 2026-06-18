import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TENANT_DEACTIVATED_PREFIX, TENANT_SLUG_CACHE_PREFIX } from '../common/constants';
import { parseTtlSeconds } from '../common/utils/parse-ttl';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async findAll(includeInactive = false) {
    return this.prisma.tenant.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async findActiveTenant(id: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id, active: true } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async create(dto: CreateTenantDto) {
    const exists = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException('Tenant slug already exists');
    }

    return this.prisma.tenant.create({
      data: { ...dto },
    });
  }

  async update(id: string, dto: UpdateTenantDto) {
    const tenant = await this.findById(id);

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }

    return this.prisma.tenant.update({
      where: { id: tenant.id },
      data,
    });
  }

  async remove(id: string, hard = false): Promise<void> {
    const tenant = await this.findById(id);

    if (hard) {
      await this.prisma.tenant.delete({ where: { id } });
    } else {
      if (!tenant.active) {
        throw new NotFoundException('Tenant is already inactive');
      }
      await this.prisma.tenant.update({ where: { id }, data: { active: false } });
    }

    // 即时吊销该租户下所有 access token
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '2h');
    const ttlSeconds = parseTtlSeconds(expiresIn);
    await this.redis.set(
      `${TENANT_DEACTIVATED_PREFIX}${id}`,
      String(Math.floor(Date.now() / 1000)),
      { ttlSeconds },
    );
  }

  /**
   * 根据 slug 解析租户 ID，优先读 Redis 缓存，未命中则查 DB 并写入缓存。
   */
  async resolveTenantId(slug: string): Promise<string | null> {
    const cacheKey = `${TENANT_SLUG_CACHE_PREFIX}${slug}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return cached;
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, active: true },
      select: { id: true },
    });
    if (!tenant) {
      return null;
    }

    // 缓存 1 小时，减少 DB 查询
    await this.redis.set(cacheKey, tenant.id, { ttlSeconds: 3600 });
    return tenant.id;
  }

  async bootstrapDefaultTenant() {
    const existing = await this.prisma.tenant.findFirst({ where: { slug: 'default' } });
    if (existing) {
      return existing;
    }

    return this.prisma.tenant.create({
      data: { slug: 'default', name: 'Default Tenant' },
    });
  }
}
