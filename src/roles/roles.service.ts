import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessService, UserAccess } from '../access/access.service';
import { PLATFORM_PERMISSION_CODES, SYSTEM_ADMIN_ROLE } from '../common/constants';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenancyContext } from '../tenancy/tenancy-context.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const roleInclude = {
  permissions: { where: { enabled: true }, include: { permission: true } },
} satisfies Prisma.RoleInclude;

const RESERVED_ROLE_CODES = new Set(['system_admin', 'admin', 'member', 'viewer']);
const PLATFORM_PERMISSIONS = new Set<string>(PLATFORM_PERMISSION_CODES);

type ScopedRole = {
  id: string;
  tenantId: string | null;
  code: string;
  builtIn: boolean;
};

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

  async getPermissionMatrix(id: string, actorId: string) {
    const tenantId = this.tenancyContext.requireTenantId();
    const role = await this.findScoped(id);
    const [permissions, bindings, actor] = await Promise.all([
      this.prisma.permission.findMany({ where: { enabled: true }, orderBy: { code: 'asc' } }),
      this.prisma.rolePermission.findMany({
        where: { roleId: role.id },
        select: { permissionId: true, enabled: true },
      }),
      this.accessService.getUserAccess(actorId, tenantId),
    ]);
    const grantedById = new Map(bindings.map((item) => [item.permissionId, item.enabled]));
    const targetIsSystemAdmin = this.isSystemAdminRole(role);
    const actorIsSystemAdmin = actor.roles.includes(SYSTEM_ADMIN_ROLE);

    return {
      roleId: role.id,
      roleCode: role.code,
      builtIn: role.builtIn,
      permissions: permissions.map((permission) => {
        const granted = targetIsSystemAdmin || grantedById.get(permission.id) === true;
        return {
          ...permission,
          granted,
          configurable: this.isPermissionConfigurable(
            role,
            permission.code,
            granted,
            actor,
            actorIsSystemAdmin,
          ),
        };
      }),
    };
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
            create: (dto.permissionIds ?? []).map((permissionId) => ({
              permissionId,
              enabled: true,
            })),
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
    this.assertDefinitionMutable(role);
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
    const tenantId = this.tenancyContext.requireTenantId();
    const role = await this.findScoped(id);
    const actor = await this.assertPermissionTargetConfigurable(role, actorId, tenantId);
    const permissions = await this.prisma.permission.findMany({
      where: { enabled: true },
      select: { id: true, code: true },
    });
    const selected = new Set(permissionIds);
    if (permissions.filter(({ id }) => selected.has(id)).length !== selected.size) {
      throw new NotFoundException('Permission not found');
    }
    this.assertCanEnablePermissions(
      permissions.filter(({ id }) => selected.has(id)),
      actor,
    );

    await this.prisma.$transaction(
      permissions.map((permission) =>
        this.prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          create: {
            roleId: role.id,
            permissionId: permission.id,
            enabled: selected.has(permission.id),
          },
          update: { enabled: selected.has(permission.id) },
        }),
      ),
    );
    await this.invalidateRoleAccess(role);
    return this.getPermissionMatrix(id, actorId);
  }

  async setPermission(id: string, permissionId: string, enabled: boolean, actorId: string) {
    const tenantId = this.tenancyContext.requireTenantId();
    const role = await this.findScoped(id);
    const actor = await this.assertPermissionTargetConfigurable(role, actorId, tenantId);
    const permission = await this.prisma.permission.findFirst({
      where: { id: permissionId, enabled: true },
      select: { id: true, code: true },
    });
    if (!permission) throw new NotFoundException('Permission not found');
    if (enabled) this.assertCanEnablePermissions([permission], actor);

    await this.prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId } },
      create: { roleId: role.id, permissionId, enabled },
      update: { enabled },
    });
    await this.invalidateRoleAccess(role);
    return this.getPermissionMatrix(id, actorId);
  }

  async remove(id: string): Promise<void> {
    const role = await this.findScoped(id);
    this.assertDefinitionMutable(role);
    await this.prisma.role.delete({ where: { id } });
    await this.accessService.invalidateTenant(role.tenantId!);
  }

  async assertRolesAssignable(actorId: string, tenantId: string, roleIds: string[]): Promise<void> {
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds }, enabled: true, OR: [{ tenantId: null }, { tenantId }] },
      include: {
        permissions: { where: { enabled: true }, include: { permission: true } },
      },
    });
    if (roles.length !== new Set(roleIds).size) throw new NotFoundException('Role not found');

    if (
      roles.some(
        (role) =>
          role.code !== SYSTEM_ADMIN_ROLE &&
          role.permissions.some(({ permission }) => PLATFORM_PERMISSIONS.has(permission.code)),
      )
    ) {
      throw new ForbiddenException('Platform permissions cannot be granted through other roles');
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
    const actor = await this.accessService.getUserAccess(actorId, tenantId);
    this.assertCanEnablePermissions(permissions, actor);
  }

  private assertCanEnablePermissions(
    permissions: Array<{ code: string }>,
    actor: UserAccess,
  ): void {
    if (permissions.some(({ code }) => PLATFORM_PERMISSIONS.has(code))) {
      throw new ForbiddenException('Platform permissions cannot be delegated to other roles');
    }
    if (actor.roles.includes(SYSTEM_ADMIN_ROLE)) return;
    const allowed = new Set(actor.permissions);
    if (permissions.some(({ code }) => !allowed.has(code))) {
      throw new ForbiddenException('Cannot grant permissions you do not own');
    }
  }

  private async assertPermissionTargetConfigurable(
    role: ScopedRole,
    actorId: string,
    tenantId: string,
  ): Promise<UserAccess> {
    if (this.isSystemAdminRole(role)) {
      throw new ForbiddenException('system_admin permissions cannot be changed');
    }
    const actor = await this.accessService.getUserAccess(actorId, tenantId);
    if (!role.tenantId && !actor.roles.includes(SYSTEM_ADMIN_ROLE)) {
      throw new ForbiddenException('Only system_admin can configure global built-in roles');
    }
    return actor;
  }

  private isPermissionConfigurable(
    role: ScopedRole,
    permissionCode: string,
    granted: boolean,
    actor: UserAccess,
    actorIsSystemAdmin: boolean,
  ): boolean {
    if (this.isSystemAdminRole(role)) return false;
    if (!role.tenantId && !actorIsSystemAdmin) return false;
    if (granted) return true;
    if (PLATFORM_PERMISSIONS.has(permissionCode)) return false;
    return actorIsSystemAdmin || actor.permissions.includes(permissionCode);
  }

  private async invalidateRoleAccess(role: ScopedRole): Promise<void> {
    if (role.tenantId) {
      await this.accessService.invalidateTenant(role.tenantId);
    } else {
      await this.accessService.invalidateAll();
    }
  }

  private async findScoped(id: string): Promise<ScopedRole> {
    const tenantId = this.tenancyContext.requireTenantId();
    const role = await this.prisma.role.findFirst({
      where: { id, OR: [{ tenantId: null }, { tenantId }] },
      select: { id: true, tenantId: true, code: true, builtIn: true },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  private assertDefinitionMutable(role: ScopedRole): void {
    if (role.builtIn || !role.tenantId) {
      throw new ForbiddenException('Built-in roles cannot be modified or deleted');
    }
  }

  private isSystemAdminRole(role: ScopedRole): boolean {
    return role.builtIn && role.tenantId === null && role.code === SYSTEM_ADMIN_ROLE;
  }

  private assertCodeIsCustom(code: string): void {
    if (RESERVED_ROLE_CODES.has(code)) {
      throw new ConflictException('Built-in role codes are reserved');
    }
  }
}
