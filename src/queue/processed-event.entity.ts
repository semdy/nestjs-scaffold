import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'processed_events' })
@Index('IDX_processed_events_expires', ['expiresAt'])
export class ProcessedEvent {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  eventId: string;

  @Column({ type: 'varchar', length: 120 })
  routingKey: string;

  @Column({ type: 'timestamp' })
  processedAt: Date;

  @Column({ type: 'timestamp' })
  expiresAt: Date; // 过期后可由 EventsCleanupService 一起清理
}
