import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RolesService } from '../roles/roles.service';
import { TenancyContext } from '../tenancy/tenancy-context.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: { findUnique: jest.Mock };
    tenantMembership: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  const rolesService = { assertRolesAssignable: jest.fn() };

  beforeEach(async () => {
    const saved = {
      id: 'user-1',
      email: 'john@example.com',
      phone: null,
      countryCode: null,
      name: 'John',
      passwordHash: 'hash',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      roleAssignments: [{ role: { code: 'member' } }],
    };
    const tx = {
      user: {
        create: jest.fn().mockResolvedValue(saved),
        update: jest.fn().mockResolvedValue(saved),
        findUniqueOrThrow: jest.fn().mockResolvedValue(saved),
      },
      tenantMembership: { create: jest.fn() },
      role: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'member-role' }) },
      userRoleAssignment: { createMany: jest.fn() },
      outboxEvent: { create: jest.fn() },
    };
    prisma = {
      user: { findUnique: jest.fn() },
      tenantMembership: { findUnique: jest.fn() },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenancyContext, useValue: { requireTenantId: () => 'tenant-1' } },
        {
          provide: ConfigService,
          useValue: { get: (_key: string, fallback: unknown) => fallback },
        },
        { provide: RedisService, useValue: {} },
        { provide: RolesService, useValue: rolesService },
        { provide: AccessService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hash' as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('creates membership, default role, and outbox event atomically', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const result = await service.create(
      { email: 'John@Example.com', name: 'John', password: 'secret123' },
      'actor-1',
    );
    expect(result.email).toBe('john@example.com');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects adding a user who is already a member of the tenant', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.tenantMembership.findUnique.mockResolvedValue({ userId: 'user-1' });
    await expect(
      service.create({ email: 'john@example.com', name: 'John', password: 'secret123' }, 'actor-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
