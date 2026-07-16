import { Injectable } from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { SYSTEM_ADMIN_ROLE } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { TenancyContext } from '../tenancy/tenancy-context.service';

/**
 * Permission codes are a static contract owned by the application source code.
 * Runtime management is intentionally limited to listing the codes an actor may assign.
 */
@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: AccessService,
    private readonly tenancyContext: TenancyContext,
  ) {}

  async findAll(actorId: string) {
    const access = await this.accessService.getUserAccess(
      actorId,
      this.tenancyContext.requireTenantId(),
    );
    return this.prisma.permission.findMany({
      where: {
        enabled: true,
        ...(access.roles.includes(SYSTEM_ADMIN_ROLE) ? {} : { code: { in: access.permissions } }),
      },
      orderBy: { code: 'asc' },
    });
  }
}
