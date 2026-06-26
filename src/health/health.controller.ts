import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthIndicatorStatus,
  HealthCheckService,
} from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator';
import { TenantRequired } from '../common/decorators/tenant-required.decorator';
import { PrismaHealthIndicator } from '../prisma/prisma-health.indicator';
import { RabbitmqService } from '../queue/rabbitmq.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly redis: RedisService,
    private readonly rabbitmq: RabbitmqService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @Public()
  @TenantRequired(false)
  @HealthCheck()
  async check(): Promise<HealthCheckResult> {
    const dlqThreshold = this.configService.get<number>('RABBITMQ_DLQ_THRESHOLD', 0);

    return this.health.check([
      () => this.db.pingCheck('database'),
      async () => ({
        redis: {
          status: (await this.redis.ping()) === 'PONG' ? 'up' : 'down',
        },
      }),
      async () => {
        try {
          await this.rabbitmq.connect();
          return { rabbitmq: { status: 'up' } };
        } catch {
          return { rabbitmq: { status: 'down' } };
        }
      },
      async () => {
        const queue = this.configService.getOrThrow<string>('RABBITMQ_QUEUE');
        const [dlqStatus, mainStatus] = await Promise.all([
          this.rabbitmq.getQueueStatus(`${queue}.dlq`),
          this.rabbitmq.getQueueStatus(queue),
        ]);

        const detail: Record<string, unknown> = {
          dlq: { messages: dlqStatus.messageCount, consumers: dlqStatus.consumerCount },
          mainQueue: { messages: mainStatus.messageCount, consumers: mainStatus.consumerCount },
        };

        if (dlqStatus.messageCount > dlqThreshold) {
          return { queue: { status: 'degraded' as HealthIndicatorStatus, ...detail } };
        }
        if (mainStatus.messageCount < 0) {
          return { queue: { status: 'down', ...detail } };
        }
        return { queue: { status: 'up', ...detail } };
      },
    ]);
  }
}
