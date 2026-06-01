import { Column, Index } from 'typeorm';
import { UuidV7Entity } from '../common/entities/uuid-v7.entity';

export abstract class TenantScopedEntity extends UuidV7Entity {
  @Index()
  @Column({ type: 'varchar', length: 36 })
  tenantId: string;
}
