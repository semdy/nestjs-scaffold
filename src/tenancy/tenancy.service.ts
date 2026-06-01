import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './tenant.entity';

@Injectable()
export class TenancyService {
  constructor(@InjectRepository(Tenant) private readonly tenants: Repository<Tenant>) {}

  async findActiveTenant(id: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id, active: true } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async bootstrapDefaultTenant(): Promise<Tenant> {
    const existing = await this.tenants.findOne({ where: { slug: 'default' } });
    if (existing) {
      return existing;
    }

    return this.tenants.save(this.tenants.create({ slug: 'default', name: 'Default Tenant' }));
  }
}
