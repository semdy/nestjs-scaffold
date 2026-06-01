import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../common/constants';
import { Tenant } from '../tenancy/tenant.entity';
import { TenantScopedEntity } from '../tenancy/tenant-scoped.entity';

@Entity({ name: 'users' })
@Index('IDX_users_tenant_active_created_at', ['tenantId', 'active', 'createdAt'])
@Unique('UQ_users_tenant_email', ['tenantId', 'email'])
export class User extends TenantScopedEntity {
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
