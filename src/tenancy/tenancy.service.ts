import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { TENANT_DEACTIVATED_PREFIX } from '../common/constants';
import { Tenant } from './tenant.entity';

@Injectable()
export class TenancyService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async findActiveTenant(id: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id, active: true } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async deactivateTenant(id: string): Promise<void> {
    const result = await this.tenants.update({ id, active: true }, { active: false });
    if (!result.affected) {
      throw new NotFoundException('Tenant not found or already inactive');
    }

    // Redis 记录停用时间，现有 access token 的 iat 早于此时间的全部失效
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '2h');
    const ttlSeconds = this.parseTtlSeconds(expiresIn);
    await this.redis.set(
      `${TENANT_DEACTIVATED_PREFIX}${id}`,
      String(Math.floor(Date.now() / 1000)),
      { ttlSeconds },
    );

    return;
  }

  async bootstrapDefaultTenant(): Promise<Tenant> {
    const existing = await this.tenants.findOne({ where: { slug: 'default' } });
    if (existing) {
      return existing;
    }

    return this.tenants.save(this.tenants.create({ slug: 'default', name: 'Default Tenant' }));
  }

  private parseTtlSeconds(expiresIn: string): number {
    const value = parseInt(expiresIn, 10);
    if (expiresIn.endsWith('h')) return value * 3600;
    if (expiresIn.endsWith('d')) return value * 86400;
    if (expiresIn.endsWith('m')) return value * 60;
    return value;
  }
}
