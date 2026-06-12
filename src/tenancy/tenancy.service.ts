import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { TENANT_DEACTIVATED_PREFIX } from '../common/constants';
import { parseTtlSeconds } from '../common/utils/parse-ttl';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './tenant.entity';

@Injectable()
export class TenancyService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async findAll(includeInactive = false): Promise<Tenant[]> {
    const where: Record<string, unknown> = {};
    if (!includeInactive) {
      where.active = true;
    }
    return this.tenants.find({ where, order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async findActiveTenant(id: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id, active: true } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async create(dto: CreateTenantDto): Promise<Tenant> {
    const exists = await this.tenants.exists({ where: { slug: dto.slug } });
    if (exists) {
      throw new ConflictException('Tenant slug already exists');
    }

    return this.tenants.save(this.tenants.create(dto));
  }

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findById(id);

    if (dto.name !== undefined) {
      tenant.name = dto.name;
    }

    return this.tenants.save(tenant);
  }

  async remove(id: string, hard = false): Promise<void> {
    const tenant = await this.findById(id);

    if (hard) {
      await this.tenants.remove(tenant);
      return;
    }

    // 软删除：标记 inactive 并即时吊销该租户下所有 access token
    if (!tenant.active) {
      throw new NotFoundException('Tenant is already inactive');
    }

    tenant.active = false;
    await this.tenants.save(tenant);

    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '2h');
    const ttlSeconds = parseTtlSeconds(expiresIn);
    await this.redis.set(
      `${TENANT_DEACTIVATED_PREFIX}${id}`,
      String(Math.floor(Date.now() / 1000)),
      { ttlSeconds },
    );
  }

  async bootstrapDefaultTenant(): Promise<Tenant> {
    const existing = await this.tenants.findOne({ where: { slug: 'default' } });
    if (existing) {
      return existing;
    }

    return this.tenants.save(this.tenants.create({ slug: 'default', name: 'Default Tenant' }));
  }
}
