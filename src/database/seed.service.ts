import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { BUILT_IN_PERMISSIONS, TENANT_ADMIN_PERMISSIONS } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { TenancyService } from '../tenancy/tenancy.service';
import { AccessService } from '../access/access.service';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tenancyService: TenancyService,
    private readonly accessService: AccessService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedAccessModel();
    await this.accessService.invalidateAll();
    if (!this.config.get<boolean>('SEED_ADMIN_ENABLED', false)) return;

    const email = this.config.get<string>('SEED_ADMIN_EMAIL')?.toLowerCase();
    const password = this.config.get<string>('SEED_ADMIN_PASSWORD');
    if (!email || !password) {
      this.logger.warn('Admin seed is enabled but credentials are missing');
      return;
    }
    const tenant = await this.tenancyService.bootstrapDefaultTenant();
    const systemRole = await this.prisma.role.findFirstOrThrow({
      where: { tenantId: null, code: 'system_admin' },
      select: { id: true },
    });
    const passwordHash = await bcrypt.hash(password, this.config.get<number>('BCRYPT_ROUNDS', 12));

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email },
        create: { email, name: 'Default System Admin', passwordHash },
        update: { active: true },
      });
      await tx.tenantMembership.upsert({
        where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
        create: { userId: user.id, tenantId: tenant.id },
        update: { active: true },
      });
      await tx.userRoleAssignment.upsert({
        where: {
          userId_tenantId_roleId: { userId: user.id, tenantId: tenant.id, roleId: systemRole.id },
        },
        create: { userId: user.id, tenantId: tenant.id, roleId: systemRole.id },
        update: {},
      });
    });
    this.logger.log(`Seeded system administrator ${email}`);
  }

  private async seedAccessModel(): Promise<void> {
    for (const permission of BUILT_IN_PERMISSIONS) {
      await this.prisma.permission.upsert({
        where: { code: permission.code },
        create: { ...permission, builtIn: true },
        update: { name: permission.name, builtIn: true, enabled: true },
      });
    }
    const definitions = [
      { code: 'system_admin', name: 'System Administrator' },
      { code: 'admin', name: 'Tenant Administrator' },
      { code: 'member', name: 'Member' },
      { code: 'viewer', name: 'Viewer' },
    ];
    for (const definition of definitions) {
      const existing = await this.prisma.role.findFirst({
        where: { tenantId: null, code: definition.code },
      });
      if (!existing) {
        await this.prisma.role.create({ data: { ...definition, builtIn: true } });
      }
    }

    const permissions = await this.prisma.permission.findMany({ select: { id: true, code: true } });
    const allIds = permissions.map(({ id }) => id);
    const adminIds = permissions
      .filter(({ code }) => TENANT_ADMIN_PERMISSIONS.includes(code as never))
      .map(({ id }) => id);
    for (const [code, ids] of [
      ['system_admin', allIds],
      ['admin', adminIds],
    ] as const) {
      const role = await this.prisma.role.findFirstOrThrow({ where: { tenantId: null, code } });
      await this.prisma.$transaction([
        this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
        this.prisma.rolePermission.createMany({
          data: ids.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        }),
      ]);
    }
  }
}
