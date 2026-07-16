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
