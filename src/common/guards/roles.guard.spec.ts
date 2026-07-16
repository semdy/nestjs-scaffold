import { Reflector } from '@nestjs/core';
import { AccessService } from '../../access/access.service';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  it('accepts a matching current-tenant role', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['admin']) };
    const access = {
      getUserAccess: jest.fn().mockResolvedValue({ roles: ['admin'], permissions: [] }),
    };
    const guard = new RolesGuard(
      reflector as unknown as Reflector,
      access as unknown as AccessService,
    );
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { sub: 'user-1', tenantId: 'tenant-1' } }),
      }),
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(access.getUserAccess).toHaveBeenCalledWith('user-1', 'tenant-1');
  });

  it('keeps the previous system_admin bypass behavior', async () => {
    const guard = new RolesGuard(
      { getAllAndOverride: () => ['some_custom_role'] } as unknown as Reflector,
      {
        getUserAccess: jest.fn().mockResolvedValue({
          roles: ['system_admin'],
          permissions: [],
        }),
      } as unknown as AccessService,
    );
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { sub: 'user-1', tenantId: 'tenant-1' } }),
      }),
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });
});
