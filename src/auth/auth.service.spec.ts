import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService verification-code login', () => {
  const createService = (user: { active: boolean }) => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    const verificationCodes = { consume: jest.fn().mockResolvedValue(undefined) };
    const service = new AuthService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      verificationCodes as never,
    );
    return { service, verificationCodes };
  };

  it('rejects a disabled user after validating an email code', async () => {
    const { service, verificationCodes } = createService({ active: false });

    await expect(
      service.loginByEmailCode({ email: 'USER@example.com', code: '123456' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(verificationCodes.consume).toHaveBeenCalledWith('email', 'user@example.com', '123456');
  });

  it('rejects a disabled user after validating a phone code', async () => {
    const { service, verificationCodes } = createService({ active: false });

    await expect(
      service.loginByPhoneCode({ countryCode: '+86', phone: '13800138000', code: '123456' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(verificationCodes.consume).toHaveBeenCalledWith('phone', '+8613800138000', '123456');
  });
});

describe('AuthService tenant list', () => {
  it('returns only active memberships of active tenants', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { tenant: { id: 'tenant-1', slug: 'first', name: 'First tenant' } },
        { tenant: { id: 'tenant-2', slug: 'second', name: 'Second tenant' } },
      ]);
    const service = new AuthService(
      { tenantMembership: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.myTenants('user-1')).resolves.toEqual([
      { id: 'tenant-1', slug: 'first', name: 'First tenant' },
      { id: 'tenant-2', slug: 'second', name: 'Second tenant' },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', active: true, tenant: { active: true } },
      select: { tenant: { select: { id: true, slug: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  });
});
