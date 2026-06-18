import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxEvent } from './outbox-event.entity';
import { ProcessedEvent } from './processed-event.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EventsCleanupService {
  private readonly logger = new Logger(EventsCleanupService.name);
  private readonly retentionHours: number;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
    @InjectRepository(ProcessedEvent)
    private readonly processedEventRepo: Repository<ProcessedEvent>,
    private readonly configService: ConfigService,
  ) {
    // 保留最近 N 小时的事件，给 Debezium 足够的消费窗口
    this.retentionHours = this.configService.get<number>('OUTBOX_RETENTION_HOURS', 72);
  }

  @Cron('0 */30 * * * *') // 每30分钟执行一次
  async cleanupExpiredEvents() {
    this.logger.log('Cleaning expired events...');
    await this.cleanupOutboxEvents().catch((err) =>
      this.logger.error('Failed to clean outbox events:', err),
    );
    await this.cleanupProcessedEvents().catch((err) =>
      this.logger.error('Failed to clean processed events:', err),
    );
  }

  async cleanupOutboxEvents(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionHours * 3600_000);

    const result = await this.outboxRepo
      .createQueryBuilder()
      .delete()
      .from(OutboxEvent)
      .where('createdAt < :cutoff', { cutoff })
      .execute();

    if ((result.affected ?? 0) > 0) {
      this.logger.log(
        `Cleaned ${result.affected} outbox events older than ${cutoff.toISOString()}`,
      );
    } else {
      this.logger.log('No outbox events cleaned');
    }
  }

  async cleanupProcessedEvents(): Promise<void> {
    const result = await this.processedEventRepo
      .createQueryBuilder()
      .delete()
      .from(ProcessedEvent)
      .where('expiresAt < :now', { now: new Date() })
      .execute();

    if ((result.affected ?? 0) > 0) {
      this.logger.log(`Cleaned ${result.affected} expired processed_events`);
    } else {
      this.logger.log('No processed events cleaned');
    }
  }
}
