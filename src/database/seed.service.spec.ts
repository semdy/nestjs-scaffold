import { SeedService } from './seed.service';

describe('SeedService', () => {
  it('clears all access caches after synchronizing roles and permissions', async () => {
    const prisma = {
      permission: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      role: {
        findFirst: jest.fn().mockResolvedValue({ id: 'role-built-in' }),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'role-built-in' }),
      },
      rolePermission: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const access = { invalidateAll: jest.fn().mockResolvedValue(undefined) };
    const service = new SeedService(
      { get: jest.fn().mockReturnValue(false) } as never,
      prisma as never,
      {} as never,
      access as never,
    );

    await service.onApplicationBootstrap();

    expect(prisma.permission.deleteMany).toHaveBeenCalled();
    expect(prisma.rolePermission.createMany).toHaveBeenCalledTimes(2);
    expect(access.invalidateAll).toHaveBeenCalledTimes(1);
    expect(access.invalidateAll.mock.invocationCallOrder[0]).toBeGreaterThan(
      prisma.rolePermission.createMany.mock.invocationCallOrder.at(-1)!,
    );
  });
});
