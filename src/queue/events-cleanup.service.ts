import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventsCleanupService {
  private readonly logger = new Logger(EventsCleanupService.name);
  private readonly retentionHours: number;

  constructor(
    private readonly prisma: PrismaService,
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

    const result = await this.prisma.outboxEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned ${result.count} outbox events older than ${cutoff.toISOString()}`);
    }
  }

  async cleanupProcessedEvents(): Promise<void> {
    const result = await this.prisma.processedEvent.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned ${result.count} expired processed_events`);
    }
  }
}
