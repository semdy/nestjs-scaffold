import { Column, Index } from 'typeorm';

export abstract class TenantScopedEntity {
  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;
}
