import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { TenantScopedEntity } from '../tenancy/tenant-scoped.entity';

@Entity({ name: 'outbox_events' })
@Index('IDX_outbox_events_tenant_created_at', ['tenantId', 'createdAt'])
@Index('IDX_outbox_events_aggregate', ['aggregateType', 'aggregateId'])
@Index('IDX_outbox_events_routing_key_created_at', ['routingKey', 'createdAt'])
export class OutboxEvent extends TenantScopedEntity {
  @Column({ type: 'varchar', length: 80 })
  aggregateType: string;

  @Column({ type: 'varchar', length: 36 })
  aggregateId: string;

  @Column({ type: 'varchar', length: 120 })
  routingKey: string;

  @Column({ type: 'json' })
  payload: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
