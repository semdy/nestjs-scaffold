import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenancyContext } from '../tenancy/tenancy-context.service';
import { TenancyService } from '../tenancy/tenancy.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly tenancyContext: TenancyContext,
    private readonly tenancyService: TenancyService,
    private readonly usersService: UsersService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.configService.get<boolean>('SEED_ADMIN_ENABLED', false)) {
      return;
    }

    const email = this.configService.get<string>('SEED_ADMIN_EMAIL');
    const password = this.configService.get<string>('SEED_ADMIN_PASSWORD');
    if (!email || !password) {
      this.logger.warn(
        'Admin seed is enabled but SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD is missing',
      );
      return;
    }

    const tenant = await this.tenancyService.bootstrapDefaultTenant();
    await this.tenancyContext.run({ requestId: 'bootstrap', tenantId: tenant.id }, async () => {
      const existing = await this.usersService.findByEmailWithPassword(tenant.id, email);
      if (existing) {
        return;
      }

      await this.usersService.create({
        email,
        name: 'Default System Admin',
        password,
        role: 'system_admin',
      });
      this.logger.log(`Seeded admin user ${email} for tenant ${tenant.id}`);
    });
  }
}
