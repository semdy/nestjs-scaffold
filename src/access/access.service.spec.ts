import { AccessService } from './access.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('AccessService', () => {
  it('gives system_admin every enabled permission', async () => {
    const prisma = {
      tenantMembership: { findFirst: jest.fn().mockResolvedValue({ userId: 'u1' }) },
      userRoleAssignment: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { role: { code: 'system_admin', builtIn: true, tenantId: null, permissions: [] } },
          ]),
      },
      permission: {
        findMany: jest.fn().mockResolvedValue([{ code: 'tenant.create' }, { code: 'user.read' }]),
      },
    };
    const redis = { getJson: jest.fn(), setJson: jest.fn() };
    const access = await new AccessService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    ).getUserAccess('u1', 't1');
    expect(access).toEqual({
      roles: ['system_admin'],
      permissions: ['tenant.create', 'user.read'],
    });
    expect(redis.setJson).toHaveBeenCalledWith('auth:access:t1:u1', access, { ttlSeconds: 300 });
  });

  it('deduplicates permissions from multiple roles', async () => {
    const prisma = {
      tenantMembership: { findFirst: jest.fn().mockResolvedValue({ userId: 'u1' }) },
      userRoleAssignment: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { role: { code: 'editor', permissions: [{ permission: { code: 'user.read' } }] } },
            { role: { code: 'auditor', permissions: [{ permission: { code: 'user.read' } }] } },
          ]),
      },
    };
    const redis = { getJson: jest.fn(), setJson: jest.fn() };
    const access = await new AccessService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    ).getUserAccess('u1', 't1');
    expect(access.permissions).toEqual(['user.read']);
  });
});
