import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcrypt';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { USER_CREATED_ROUTING_KEY } from '../queue/events/user-created.event';
import { OutboxEvent } from '../queue/outbox-event.entity';
import { RedisService } from '../redis/redis.service';
import { LAST_LOGOUT_PREFIX } from '../common/constants';
import { parseTtlSeconds } from '../common/utils/parse-ttl';
import { TenancyContext } from '../tenancy/tenancy-context.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly tenancyContext: TenancyContext,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const tenantId = this.tenancyContext.requireTenantId();
    const email = dto.email.toLowerCase();
    const exists = await this.users.exists({ where: { tenantId, email } });
    if (exists) {
      throw new ConflictException('User email already exists in this tenant');
    }

    const rounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const usersRepository = manager.getRepository(User);
        const outboxRepository = manager.getRepository(OutboxEvent);
        const user = await usersRepository.save(
          usersRepository.create({
            tenantId,
            email,
            name: dto.name,
            passwordHash,
            role: dto.role ?? 'member',
          }),
        );
        const occurredAt = new Date().toISOString();

        // CDC subscribes to inserts in outbox_events and forwards them to the queue.
        await outboxRepository.save(
          outboxRepository.create({
            tenantId: user.tenantId,
            aggregateType: 'user',
            aggregateId: user.id,
            routingKey: USER_CREATED_ROUTING_KEY,
            payload: {
              userId: user.id,
              tenantId: user.tenantId,
              email: user.email,
              occurredAt,
            },
          }),
        );

        return user;
      });
    } catch (error) {
      if (this.isUserEmailConflict(error)) {
        throw new ConflictException('User email already exists in this tenant');
      }
      throw error;
    }
  }

  async findAllForTenant(): Promise<User[]> {
    return this.users.find({
      where: { tenantId: this.tenancyContext.requireTenantId(), active: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findByIdForTenant(id: string): Promise<User> {
    const user = await this.users.findOne({
      where: { id, tenantId: this.tenancyContext.requireTenantId(), active: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByEmailWithPassword(tenantId: string, email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.tenantId = :tenantId', { tenantId })
      .andWhere('user.email = :email', { email: email.toLowerCase() })
      .andWhere('user.active = :active', { active: true })
      .getOne();
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const tenantId = this.tenancyContext.requireTenantId();
    const user = await this.users.findOne({ where: { id, tenantId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    /**
     * 因为 (tenantId, email) 有数据库唯一约束：

       @Unique('UQ_users_tenant_email', ['tenantId', 'email'])

       同一个租户下永远不可能有两个相同邮箱的用户，findOne 最多返回一条。这个应用层检查只是为了把 DB 的约束冲突转成友好的 409 报错，而不是让 TypeORM 抛原始 QueryFailedError。

       其它字段（name、role 等）没有唯一约束，不需要做冲突检测。
     */
    if (dto.email) {
      const email = dto.email.toLowerCase();
      const existing = await this.users.findOne({ where: { tenantId, email, active: true } });
      if (existing && existing.id !== id) {
        throw new ConflictException('User email already exists in this tenant');
      }
      user.email = email;
    }

    if (dto.name !== undefined) {
      user.name = dto.name;
    }

    if (dto.password !== undefined) {
      const rounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);
      user.passwordHash = await bcrypt.hash(dto.password, rounds);
    }

    if (dto.role !== undefined) {
      user.role = dto.role;
    }

    return this.users.save(user);
  }

  async remove(id: string, hard = false): Promise<void> {
    const tenantId = this.tenancyContext.requireTenantId();
    const user = await this.users.findOne({ where: { id, tenantId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (hard) {
      await this.users.remove(user);
    } else {
      user.active = false;
      await this.users.save(user);
    }

    // 即时吊销该用户所有 access token
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '2h');
    const ttlSeconds = parseTtlSeconds(expiresIn);
    await this.redis.set(`${LAST_LOGOUT_PREFIX}${id}`, String(Math.floor(Date.now() / 1000)), {
      ttlSeconds,
    });
  }
  private isUserEmailConflict(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as {
      code?: string;
      errno?: number;
      constraint?: string;
      sqlMessage?: string;
      message?: string;
    };

    if (driverError.code === '23505' && driverError.constraint === 'UQ_users_tenant_email') {
      return true;
    }

    if (driverError.errno === 1062) {
      const message = driverError.sqlMessage ?? driverError.message ?? '';
      return message.includes('UQ_users_tenant_email');
    }

    return false;
  }
}
