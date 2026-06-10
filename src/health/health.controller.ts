import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator';
import { TenantRequired } from '../common/decorators/tenant-required.decorator';
import { RabbitmqService } from '../queue/rabbitmq.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisService,
    private readonly rabbitmq: RabbitmqService,
  ) {}

  @Get()
  @Public()
  @TenantRequired(false)
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
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
    ]);
  }
}
