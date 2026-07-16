import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from './roles.service';

describe('RolesService authorization boundaries', () => {
  it('prevents tenant admins from granting permissions they do not own', async () => {
    const prisma = {
      permission: {
        findMany: jest.fn().mockResolvedValue([{ id: 'p-delete', code: 'user.delete' }]),
      },
      role: { create: jest.fn() },
    } as unknown as PrismaService;
    const service = new RolesService(
      prisma,
      { requireTenantId: () => 'tenant-1' } as never,
      {
        getUserAccess: jest
          .fn()
          .mockResolvedValue({ roles: ['admin'], permissions: ['user.read'] }),
      } as never,
    );

    await expect(
      service.create({ code: 'auditor', name: 'Auditor', permissionIds: ['p-delete'] }, 'admin-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects mutation of a built-in role', async () => {
    const prisma = {
      role: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'role-admin',
          tenantId: null,
          code: 'admin',
          builtIn: true,
        }),
      },
    } as unknown as PrismaService;
    const service = new RolesService(
      prisma,
      { requireTenantId: () => 'tenant-1' } as never,
      {} as never,
    );

    await expect(service.update('role-admin', { name: 'Changed' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('does not let system_admin delegate platform permissions to a tenant role', async () => {
    const prisma = {
      permission: {
        findMany: jest.fn().mockResolvedValue([{ id: 'p-tenant', code: 'tenant.create' }]),
      },
      role: { create: jest.fn() },
    } as unknown as PrismaService;
    const service = new RolesService(
      prisma,
      { requireTenantId: () => 'tenant-1' } as never,
      {
        getUserAccess: jest.fn().mockResolvedValue({
          roles: ['system_admin'],
          permissions: ['tenant.create'],
        }),
      } as never,
    );

    await expect(
      service.create(
        { code: 'tenant_operator', name: 'Tenant Operator', permissionIds: ['p-tenant'] },
        'system-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('invalidates the tenant access cache after role update and delete', async () => {
    const role = {
      id: 'role-editor',
      tenantId: 'tenant-1',
      code: 'editor',
      name: 'Editor',
      description: '',
      builtIn: false,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      role: {
        findFirst: jest.fn().mockResolvedValue(role),
        update: jest.fn().mockResolvedValue({ ...role, name: 'Senior Editor' }),
        delete: jest.fn().mockResolvedValue(role),
      },
    } as unknown as PrismaService;
    const access = { invalidateTenant: jest.fn() };
    const service = new RolesService(
      prisma,
      { requireTenantId: () => 'tenant-1' } as never,
      access as never,
    );

    await service.update(role.id, { name: 'Senior Editor' });
    await service.remove(role.id);

    expect(access.invalidateTenant).toHaveBeenCalledTimes(2);
    expect(access.invalidateTenant).toHaveBeenNthCalledWith(1, 'tenant-1');
  });

  it('returns every global permission with granted and configurable switch state', async () => {
    const prisma = {
      role: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'role-auditor',
          tenantId: 'tenant-1',
          code: 'auditor',
          builtIn: false,
        }),
      },
      permission: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'p-read', code: 'user.read', enabled: true },
          { id: 'p-delete', code: 'user.delete', enabled: true },
          { id: 'p-tenant', code: 'tenant.create', enabled: true },
        ]),
      },
      rolePermission: {
        findMany: jest.fn().mockResolvedValue([
          { permissionId: 'p-read', enabled: true },
          { permissionId: 'p-delete', enabled: false },
        ]),
      },
    };
    const service = new RolesService(
      prisma as never,
      { requireTenantId: () => 'tenant-1' } as never,
      {
        getUserAccess: jest
          .fn()
          .mockResolvedValue({ roles: ['admin'], permissions: ['user.read'] }),
      } as never,
    );

    const result = await service.getPermissionMatrix('role-auditor', 'admin-1');

    expect(result.permissions).toEqual([
      expect.objectContaining({ id: 'p-read', granted: true, configurable: true }),
      expect.objectContaining({ id: 'p-delete', granted: false, configurable: false }),
      expect.objectContaining({ id: 'p-tenant', granted: false, configurable: false }),
    ]);
  });

  it('only lets system_admin configure global built-in roles and clears all caches', async () => {
    const role = { id: 'role-admin', tenantId: null, code: 'admin', builtIn: true };
    const prisma = {
      role: { findFirst: jest.fn().mockResolvedValue(role) },
      permission: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p-read', code: 'user.read' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'p-read', code: 'user.read' }]),
      },
      rolePermission: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([{ permissionId: 'p-read', enabled: true }]),
      },
    };
    const access = {
      getUserAccess: jest
        .fn()
        .mockResolvedValue({ roles: ['system_admin'], permissions: ['user.read'] }),
      invalidateAll: jest.fn(),
    };
    const service = new RolesService(
      prisma as never,
      { requireTenantId: () => 'tenant-1' } as never,
      access as never,
    );

    await service.setPermission(role.id, 'p-read', true, 'system-1');

    expect(prisma.rolePermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { enabled: true } }),
    );
    expect(access.invalidateAll).toHaveBeenCalledTimes(1);
  });

  it('rejects a tenant admin changing a global built-in role', async () => {
    const prisma = {
      role: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'role-viewer',
          tenantId: null,
          code: 'viewer',
          builtIn: true,
        }),
      },
    };
    const service = new RolesService(
      prisma as never,
      { requireTenantId: () => 'tenant-1' } as never,
      {
        getUserAccess: jest
          .fn()
          .mockResolvedValue({ roles: ['admin'], permissions: ['role.assign_permissions'] }),
      } as never,
    );

    await expect(
      service.setPermission('role-viewer', 'p-read', true, 'admin-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
