/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import bcrypt from 'bcrypt';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { USER_CREATED_ROUTING_KEY } from '../queue/events/user-created.event';
import { OutboxEvent } from '../queue/outbox-event.entity';
import { TenancyContext } from '../tenancy/tenancy-context.service';
import { RedisService } from '../redis/redis.service';
import { User } from './user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: jest.Mocked<Pick<Repository<User>, 'exists'>>;
  let dataSource: { transaction: jest.Mock };
  let tenancyContext: { requireTenantId: jest.Mock };
  let configService: { get: jest.Mock };
  let redis: { set: jest.Mock };

  beforeEach(async () => {
    usersRepository = {
      exists: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn(),
    };
    tenancyContext = {
      requireTenantId: jest.fn().mockReturnValue('tenant-1'),
    };
    configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: number) => {
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
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: DataSource, useValue: dataSource },
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
    usersRepository.exists.mockResolvedValue(false);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);

    const savedUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'john@example.com',
      name: 'John',
      passwordHash: 'hashed-password',
      role: 'member',
    } as User;
    const txUsersRepository = {
      create: jest.fn().mockImplementation((entity) => entity),
      save: jest.fn().mockResolvedValue(savedUser),
    };
    const txOutboxRepository = {
      create: jest.fn().mockImplementation((entity) => entity),
      save: jest.fn().mockResolvedValue(undefined),
    };

    dataSource.transaction.mockImplementation(
      async (callback: (manager: unknown) => Promise<User>) =>
        callback({
          getRepository: jest.fn((entity) => {
            if (entity === User) {
              return txUsersRepository;
            }
            if (entity === OutboxEvent) {
              return txOutboxRepository;
            }
            throw new Error(`Unexpected repository: ${String(entity)}`);
          }),
        }),
    );

    const result = await service.create({
      email: 'John@Example.com',
      name: 'John',
      password: 'secret',
      role: 'member',
    });

    expect(result).toBe(savedUser);
    expect(usersRepository.exists).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', email: 'john@example.com' },
    });
    expect(txUsersRepository.save).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      email: 'john@example.com',
      name: 'John',
      passwordHash: 'hashed-password',
      role: 'member',
    });
    expect(txOutboxRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        aggregateType: 'user',
        aggregateId: 'user-1',
        routingKey: USER_CREATED_ROUTING_KEY,
        payload: expect.objectContaining({
          userId: 'user-1',
          tenantId: 'tenant-1',
          email: 'john@example.com',
          occurredAt: expect.any(String),
        }),
      }),
    );
  });

  it('throws a conflict before opening a transaction when the email already exists', async () => {
    usersRepository.exists.mockResolvedValue(true);

    await expect(
      service.create({
        email: 'john@example.com',
        name: 'John',
        password: 'secret',
        role: 'member',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('maps a unique constraint violation raised inside the transaction to ConflictException', async () => {
    usersRepository.exists.mockResolvedValue(false);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
    dataSource.transaction.mockRejectedValue(
      new QueryFailedError(
        'INSERT INTO users ...',
        [],
        Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
          constraint: 'UQ_users_tenant_email',
        }),
      ),
    );

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
