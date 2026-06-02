import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcrypt';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { USER_CREATED_ROUTING_KEY } from '../queue/events/user-created.event';
import { OutboxEvent } from '../queue/outbox-event.entity';
import { TenancyContext } from '../tenancy/tenancy-context.service';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly tenancyContext: TenancyContext,
    private readonly configService: ConfigService,
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
