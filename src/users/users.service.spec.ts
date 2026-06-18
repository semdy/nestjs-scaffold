import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client';
import { TenancyContext } from '../tenancy/tenancy-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    outboxEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let tenancyContext: { requireTenantId: jest.Mock };
  let configService: { get: jest.Mock };
  let redis: { set: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      outboxEvent: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    tenancyContext = {
      requireTenantId: jest.fn().mockReturnValue('tenant-1'),
    };
    configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
        if (key === 'BCRYPT_ROUNDS') {
          return 1;
        }
        return defaultValue;
      }),
    };
    redis = { set: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenancyContext, useValue: tenancyContext },
        { provide: ConfigService, useValue: configService },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a user and stores the matching outbox event in one transaction', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);

    const savedUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'john@example.com',
      name: 'John',
      role: 'member',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback({
          user: { ...prisma.user, create: jest.fn().mockResolvedValue(savedUser) },
          outboxEvent: { create: jest.fn().mockResolvedValue(undefined) },
          $transaction: prisma.$transaction,
        }),
    );

    const result = await service.create({
      email: 'John@Example.com',
      name: 'John',
      password: 'secret',
      role: 'member',
    });

    expect(result).toBe(savedUser);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', email: 'john@example.com' },
      select: { id: true },
    });
  });

  it('throws a conflict before opening a transaction when the email already exists', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.create({
        email: 'john@example.com',
        name: 'John',
        password: 'secret',
        role: 'member',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('maps a unique constraint violation raised inside the transaction to ConflictException', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);

    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`tenantId`,`email`)',
      { code: 'P2002', clientVersion: '7.0.0' },
    );
    prisma.$transaction.mockRejectedValue(prismaError);

    await expect(
      service.create({
        email: 'john@example.com',
        name: 'John',
        password: 'secret',
        role: 'member',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
