import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';

import { Prisma } from '../generated/prisma/client';
import { UserRole } from '../common/constants';
import { USER_CREATED_ROUTING_KEY } from '../queue/events/user-created.event';
import { RedisService } from '../redis/redis.service';
import { LAST_LOGOUT_PREFIX } from '../common/constants';
import { parseTtlSeconds } from '../common/utils/parse-ttl';
import { TenancyContext } from '../tenancy/tenancy-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenancyContext: TenancyContext,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async create(dto: Omit<CreateUserDto, 'role'> & { role?: UserRole }) {
    const tenantId = this.tenancyContext.requireTenantId();
    const email = dto.email.toLowerCase();
    const exists = await this.prisma.user.findFirst({
      where: { tenantId, email },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException('User email already exists in this tenant');
    }

    const rounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            tenantId,
            email,
            name: dto.name,
            passwordHash,
            role: dto.role ?? 'member',
          },
        });
        const occurredAt = new Date().toISOString();

        // CDC subscribes to inserts in outbox_events and forwards them to the queue.
        await tx.outboxEvent.create({
          data: {
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
          },
        });

        return user;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('User email already exists in this tenant');
      }
      throw error;
    }
  }

  async findAllForTenant() {
    return this.prisma.user.findMany({
      where: { tenantId: this.tenancyContext.requireTenantId(), active: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByIdForTenant(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId: this.tenancyContext.requireTenantId(), active: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByEmailWithPassword(tenantId: string, email: string) {
    return this.prisma.user.findFirst({
      where: { tenantId, email: email.toLowerCase(), active: true },
      omit: { passwordHash: false },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    const tenantId = this.tenancyContext.requireTenantId();
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const data: Prisma.UserUpdateInput = {};

    /**
     * 因为 (tenantId, email) 有数据库唯一约束：
     *
     *   @@unique([tenantId, email], map: "UQ_users_tenant_email")
     *
     * 同一个租户下永远不可能有两个相同邮箱的用户。这个应用层检查只是为了把 DB 的约束冲突转成友好的 409 报错。
     */
    if (dto.email) {
      const email = dto.email.toLowerCase();
      const existing = await this.prisma.user.findFirst({
        where: { tenantId, email, active: true },
        select: { id: true },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('User email already exists in this tenant');
      }
      data.email = email;
    }

    if (dto.name !== undefined) {
      data.name = dto.name;
    }

    if (dto.password !== undefined) {
      const rounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);
      data.passwordHash = await bcrypt.hash(dto.password, rounds);
    }

    if (dto.role !== undefined) {
      data.role = dto.role;
    }

    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, hard = false): Promise<void> {
    const tenantId = this.tenancyContext.requireTenantId();
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (hard) {
      await this.prisma.user.delete({ where: { id } });
    } else {
      await this.prisma.user.update({ where: { id }, data: { active: false } });
    }

    // 即时吊销该用户所有 access token
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '2h');
    const ttlSeconds = parseTtlSeconds(expiresIn);
    await this.redis.set(`${LAST_LOGOUT_PREFIX}${id}`, String(Math.floor(Date.now() / 1000)), {
      ttlSeconds,
    });
  }
}
