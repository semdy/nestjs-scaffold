import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { AccessService } from '../access/access.service';
import { LAST_LOGOUT_PREFIX } from '../common/constants';
import { parseTtlSeconds } from '../common/utils/parse-ttl';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { USER_CREATED_ROUTING_KEY } from '../queue/events/user-created.event';
import { RedisService } from '../redis/redis.service';
import { RolesService } from '../roles/roles.service';
import { TenancyContext } from '../tenancy/tenancy-context.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const userAccessInclude = (tenantId: string) => ({
  roleAssignments: {
    where: { tenantId, role: { enabled: true } },
    include: { role: true },
  },
});

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenancyContext: TenancyContext,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
    private readonly rolesService: RolesService,
    private readonly accessService: AccessService,
  ) {}

  async create(dto: CreateUserDto, actorId: string) {
    const tenantId = this.tenancyContext.requireTenantId();
    const email = dto.email.toLowerCase();
    if (dto.roleIds?.length) {
      await this.rolesService.assertRolesAssignable(actorId, tenantId, dto.roleIds);
    }
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      const membership = await this.prisma.tenantMembership.findUnique({
        where: { userId_tenantId: { userId: existing.id, tenantId } },
      });
      if (membership) throw new ConflictException('User already belongs to this tenant');
    }

    const passwordHash = await bcrypt.hash(
      dto.password,
      this.configService.get<number>('BCRYPT_ROUNDS', 12),
    );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = existing
          ? await tx.user.update({
              where: { id: existing.id },
              data: { active: true, passwordHash: existing.passwordHash ?? passwordHash },
            })
          : await tx.user.create({
              data: { email, name: dto.name, passwordHash },
            });
        await tx.tenantMembership.create({ data: { userId: user.id, tenantId } });
        const roleIds = dto.roleIds?.length
          ? dto.roleIds
          : [
              (
                await tx.role.findFirstOrThrow({
                  where: { tenantId: null, code: 'member', enabled: true },
                  select: { id: true },
                })
              ).id,
            ];
        await tx.userRoleAssignment.createMany({
          data: roleIds.map((roleId) => ({ userId: user.id, tenantId, roleId })),
        });
        await tx.outboxEvent.create({
          data: {
            tenantId,
            aggregateType: 'user',
            aggregateId: user.id,
            routingKey: USER_CREATED_ROUTING_KEY,
            payload: { userId: user.id, tenantId, email, occurredAt: new Date().toISOString() },
          },
        });
        return tx.user.findUniqueOrThrow({
          where: { id: user.id },
          include: userAccessInclude(tenantId),
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('User email already exists');
      }
      throw error;
    }
  }

  async findAllForTenant() {
    const tenantId = this.tenancyContext.requireTenantId();
    return this.prisma.user.findMany({
      where: { memberships: { some: { tenantId, active: true } } },
      include: userAccessInclude(tenantId),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByIdForTenant(id: string) {
    const tenantId = this.tenancyContext.requireTenantId();
    const user = await this.prisma.user.findFirst({
      where: { id, memberships: { some: { tenantId, active: true } } },
      include: userAccessInclude(tenantId),
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  findByEmailWithPassword(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      omit: { passwordHash: false },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    const tenantId = this.tenancyContext.requireTenantId();
    await this.findByIdForTenant(id);
    const data: Prisma.UserUpdateInput = {};
    if (dto.email) data.email = dto.email.toLowerCase();
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.password !== undefined) {
      data.passwordHash = await bcrypt.hash(
        dto.password,
        this.configService.get<number>('BCRYPT_ROUNDS', 12),
      );
    }
    const result = await this.prisma.user.update({
      where: { id },
      data,
      include: userAccessInclude(tenantId),
    });
    await this.accessService.invalidateUser(id);
    return result;
  }

  async setRoles(id: string, roleIds: string[], actorId: string) {
    const tenantId = this.tenancyContext.requireTenantId();
    await this.findByIdForTenant(id);
    await this.rolesService.assertRolesAssignable(actorId, tenantId, roleIds);
    await this.prisma.$transaction([
      this.prisma.userRoleAssignment.deleteMany({ where: { userId: id, tenantId } }),
      this.prisma.userRoleAssignment.createMany({
        data: roleIds.map((roleId) => ({ userId: id, tenantId, roleId })),
        skipDuplicates: true,
      }),
    ]);
    await this.accessService.invalidateUser(id, tenantId);
    return this.findByIdForTenant(id);
  }

  async remove(id: string, hard = false): Promise<void> {
    const tenantId = this.tenancyContext.requireTenantId();
    await this.findByIdForTenant(id);
    if (hard) {
      await this.prisma.$transaction([
        this.prisma.userRoleAssignment.deleteMany({ where: { userId: id, tenantId } }),
        this.prisma.tenantMembership.delete({
          where: { userId_tenantId: { userId: id, tenantId } },
        }),
      ]);
      if ((await this.prisma.tenantMembership.count({ where: { userId: id } })) === 0) {
        await this.prisma.user.delete({ where: { id } });
      }
    } else {
      await this.prisma.tenantMembership.update({
        where: { userId_tenantId: { userId: id, tenantId } },
        data: { active: false },
      });
    }
    await this.accessService.invalidateUser(id, tenantId);
    const ttlSeconds = parseTtlSeconds(this.configService.get<string>('JWT_EXPIRES_IN', '2h'));
    await this.redis.set(`${LAST_LOGOUT_PREFIX}${id}`, String(Math.floor(Date.now() / 1000)), {
      ttlSeconds,
    });
  }
}
