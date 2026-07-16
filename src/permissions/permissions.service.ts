import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { SYSTEM_ADMIN_ROLE } from '../common/constants';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenancyContext } from '../tenancy/tenancy-context.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

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

  async findOne(id: string) {
    const permission = await this.prisma.permission.findUnique({ where: { id } });
    if (!permission) throw new NotFoundException('Permission not found');
    return permission;
  }

  async create(dto: CreatePermissionDto) {
    try {
      const permission = await this.prisma.permission.create({ data: dto });
      await this.accessService.invalidateAll();
      return permission;
    } catch (error) {
      this.mapUniqueConflict(error);
    }
  }

  async update(id: string, dto: UpdatePermissionDto) {
    const permission = await this.findOne(id);
    this.assertMutable(permission);
    try {
      const updated = await this.prisma.permission.update({ where: { id }, data: dto });
      await this.accessService.invalidateAll();
      return updated;
    } catch (error) {
      this.mapUniqueConflict(error);
    }
  }

  async remove(id: string): Promise<void> {
    const permission = await this.findOne(id);
    this.assertMutable(permission);
    await this.prisma.permission.delete({ where: { id } });
    await this.accessService.invalidateAll();
  }

  private assertMutable(permission: { builtIn: boolean }): void {
    if (permission.builtIn) {
      throw new ForbiddenException('Built-in permissions cannot be modified or deleted');
    }
  }

  private mapUniqueConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Permission code already exists');
    }
    throw error;
  }
}
