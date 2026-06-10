import { Column, CreateDateColumn, Entity, Index, ManyToOne, UpdateDateColumn } from 'typeorm';
import { TenantScopedEntity } from '../tenancy/tenant-scoped.entity';
import { Tenant } from '../tenancy/tenant.entity';
import { User } from '../users/user.entity';

@Entity({ name: 'refresh_tokens' })
@Index('IDX_refresh_tokens_user_revoked_expires', ['userId', 'revokedAt', 'expiresAt'])
export class RefreshToken extends TenantScopedEntity {

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Index({ unique: true })
  @Column({ length: 64 })
  tokenHash: string;

  @Column()
  expiresAt: Date;

  @Column({ nullable: true })
  revokedAt?: Date;

  @Column({ type: 'varchar', length: 36, nullable: true })
  replacedByTokenId?: string;

  @Column({ nullable: true, length: 512 })
  userAgent?: string;

  @Column({ nullable: true, length: 64 })
  ipAddress?: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
