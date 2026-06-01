import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { TenancyContext } from '../tenancy/tenancy-context.service';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly tenancyContext: TenancyContext,
    private readonly configService: ConfigService,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const tenantId = this.tenancyContext.requireTenantId();
    const exists = await this.users.exists({ where: { tenantId, email: dto.email.toLowerCase() } });
    if (exists) {
      throw new ConflictException('User email already exists in this tenant');
    }

    const rounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    return this.users.save(
      this.users.create({
        tenantId,
        email: dto.email.toLowerCase(),
        name: dto.name,
        passwordHash,
        role: dto.role ?? 'member',
      }),
    );
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
}
