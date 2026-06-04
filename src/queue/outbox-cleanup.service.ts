import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxEvent } from './outbox-event.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OutboxCleanupService {
  private readonly logger = new Logger(OutboxCleanupService.name);
  private readonly retentionHours: number;
  private readonly batchSize: number;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
    private readonly configService: ConfigService,
  ) {
    // 保留最近 N 小时的事件，给 Debezium 足够的消费窗口
    this.retentionHours = this.configService.get<number>('OUTBOX_RETENTION_HOURS', 72);
    this.batchSize = this.configService.get<number>('OUTBOX_CLEANUP_BATCH_SIZE', 1000);
  }

  @Cron('0 */30 * * * *') // 每30分钟执行一次
  async cleanExpiredEvents(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionHours * 3600_000);
    let totalDeleted = 0;

    // 分批删除，避免长事务锁表
    while (true) {
      const result = await this.outboxRepo
        .createQueryBuilder()
        .delete()
        .from(OutboxEvent)
        .where('createdAt < :cutoff', { cutoff })
        .limit(this.batchSize)
        .execute();

      totalDeleted += result.affected ?? 0;

      if ((result.affected ?? 0) < this.batchSize) {
        break;
      }
    }

    if (totalDeleted > 0) {
      this.logger.log(`Cleaned ${totalDeleted} outbox events older than ${cutoff.toISOString()}`);
    }
  }
}
