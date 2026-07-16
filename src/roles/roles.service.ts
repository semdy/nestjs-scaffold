import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { PLATFORM_PERMISSION_CODES, SYSTEM_ADMIN_ROLE } from '../common/constants';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenancyContext } from '../tenancy/tenancy-context.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const roleInclude = {
  permissions: { include: { permission: true } },
} satisfies Prisma.RoleInclude;

const RESERVED_ROLE_CODES = new Set(['system_admin', 'admin', 'member', 'viewer']);
const PLATFORM_PERMISSIONS = new Set<string>(PLATFORM_PERMISSION_CODES);

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenancyContext: TenancyContext,
    private readonly accessService: AccessService,
  ) {}

  async findAll() {
    const tenantId = this.tenancyContext.requireTenantId();
    return this.prisma.role.findMany({
      where: { enabled: true, OR: [{ tenantId: null }, { tenantId }] },
      include: roleInclude,
      orderBy: [{ builtIn: 'desc' }, { code: 'asc' }],
    });
  }

  async findOne(id: string) {
    const role = await this.findScoped(id);
    return this.prisma.role.findUniqueOrThrow({ where: { id: role.id }, include: roleInclude });
  }

  async create(dto: CreateRoleDto, actorId: string) {
    const tenantId = this.tenancyContext.requireTenantId();
    this.assertCodeIsCustom(dto.code);
    await this.assertPermissionIdsAssignable(actorId, tenantId, dto.permissionIds ?? []);
    try {
      const role = await this.prisma.role.create({
        data: {
          tenantId,
          code: dto.code,
          name: dto.name,
          description: dto.description,
          permissions: {
            create: (dto.permissionIds ?? []).map((permissionId) => ({ permissionId })),
          },
        },
        include: roleInclude,
      });
      await this.accessService.invalidateTenant(tenantId);
      return role;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Role code already exists in this tenant');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.findScoped(id);
    this.assertMutable(role);
    if (dto.code) this.assertCodeIsCustom(dto.code);
    const result = await this.prisma.role.update({
      where: { id },
      data: dto,
      include: roleInclude,
    });
    await this.accessService.invalidateTenant(role.tenantId!);
    return result;
  }

  async setPermissions(id: string, permissionIds: string[], actorId: string) {
    const role = await this.findScoped(id);
    this.assertMutable(role);
    await this.assertPermissionIdsAssignable(actorId, role.tenantId!, permissionIds);
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        skipDuplicates: true,
      }),
    ]);
    await this.accessService.invalidateTenant(role.tenantId!);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const role = await this.findScoped(id);
    this.assertMutable(role);
    await this.prisma.role.delete({ where: { id } });
    await this.accessService.invalidateTenant(role.tenantId!);
  }

  async assertRolesAssignable(actorId: string, tenantId: string, roleIds: string[]): Promise<void> {
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds }, enabled: true, OR: [{ tenantId: null }, { tenantId }] },
      include: { permissions: { include: { permission: true } } },
    });
    if (roles.length !== new Set(roleIds).size) throw new NotFoundException('Role not found');

    if (
      roles.some(
        (role) =>
          role.code !== SYSTEM_ADMIN_ROLE &&
          role.permissions.some(({ permission }) => PLATFORM_PERMISSIONS.has(permission.code)),
      )
    ) {
      throw new ForbiddenException('Platform permissions cannot be granted through tenant roles');
    }

    const actor = await this.accessService.getUserAccess(actorId, tenantId);
    if (actor.roles.includes(SYSTEM_ADMIN_ROLE)) return;
    const actorPermissions = new Set(actor.permissions);
    if (
      roles.some(
        (role) =>
          role.code === SYSTEM_ADMIN_ROLE ||
          role.permissions.some(({ permission }) => !actorPermissions.has(permission.code)),
      )
    ) {
      throw new ForbiddenException('Cannot grant a role containing permissions you do not own');
    }
  }

  private async assertPermissionIdsAssignable(
    actorId: string,
    tenantId: string,
    permissionIds: string[],
  ): Promise<void> {
    const permissions = await this.prisma.permission.findMany({
      where: { id: { in: permissionIds }, enabled: true },
      select: { id: true, code: true },
    });
    if (permissions.length !== new Set(permissionIds).size) {
      throw new NotFoundException('Permission not found');
    }
    if (permissions.some(({ code }) => PLATFORM_PERMISSIONS.has(code))) {
      throw new ForbiddenException('Platform permissions cannot be delegated to tenant roles');
    }
    const actor = await this.accessService.getUserAccess(actorId, tenantId);
    if (actor.roles.includes(SYSTEM_ADMIN_ROLE)) return;
    const allowed = new Set(actor.permissions);
    if (permissions.some(({ code }) => !allowed.has(code))) {
      throw new ForbiddenException('Cannot grant permissions you do not own');
    }
  }

  private async findScoped(id: string) {
    const tenantId = this.tenancyContext.requireTenantId();
    const role = await this.prisma.role.findFirst({
      where: { id, OR: [{ tenantId: null }, { tenantId }] },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  private assertMutable(role: { builtIn: boolean; tenantId: string | null }): void {
    if (role.builtIn || !role.tenantId) {
      throw new ForbiddenException('Built-in roles cannot be modified or deleted');
    }
  }

  private assertCodeIsCustom(code: string): void {
    if (RESERVED_ROLE_CODES.has(code)) {
      throw new ConflictException('Built-in role codes are reserved');
    }
  }
}
