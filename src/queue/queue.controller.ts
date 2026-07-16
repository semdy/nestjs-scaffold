import { Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { DlqConsumerService } from './dlq-consumer.service';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionCode } from '../common/constants';

@ApiTags('adminQueue')
@Controller('admin/queue')
@Permissions(PermissionCode.DeadLetterRetry)
export class QueueAdminController {
  constructor(private readonly dlqConsumer: DlqConsumerService) {}

  /** 重投 DLQ 中的一条消息 */
  @Post('dlq/republish')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async republishOne(): Promise<{ republished: boolean; routingKey?: string }> {
    return this.dlqConsumer.republishOne();
  }

  /** 重投 DLQ 中的所有消息 */
  @Post('dlq/republish-all')
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  async republishAll(): Promise<{ count: number }> {
    const count = await this.dlqConsumer.republishAll();
    return { count };
  }
}
