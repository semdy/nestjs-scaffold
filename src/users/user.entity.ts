import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../common/constants';
import { Tenant } from '../tenancy/tenant.entity';
import { TenantScopedEntity } from '../tenancy/tenant-scoped.entity';

@Entity({ name: 'users' })
@Unique(['tenantId', 'email'])
export class User extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 180 })
  email: string;

  @Column({ length: 120 })
  name: string;

  @Column({ select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 30, default: 'member' })
  role: UserRole;

  @Column({ default: true })
  active: boolean;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
