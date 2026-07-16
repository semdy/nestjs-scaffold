import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from './permissions.service';

describe('PermissionsService cache invalidation', () => {
  it('invalidates every access cache after permission update and delete', async () => {
    const permission = {
      id: 'permission-1',
      code: 'document.publish',
      name: 'Publish',
      description: '',
      builtIn: false,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      permission: {
        findUnique: jest.fn().mockResolvedValue(permission),
        update: jest.fn().mockResolvedValue({ ...permission, enabled: false }),
        delete: jest.fn().mockResolvedValue(permission),
      },
    };
    const access = { invalidateAll: jest.fn() };
    const service = new PermissionsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessService,
      {} as never,
    );

    await service.update(permission.id, { enabled: false });
    await service.remove(permission.id);

    expect(access.invalidateAll).toHaveBeenCalledTimes(2);
  });
});
