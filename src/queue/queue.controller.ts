import { Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DlqConsumerService } from './dlq-consumer.service';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('adminQueue')
@Controller('admin/queue')
@Roles('admin')
export class QueueAdminController {
  constructor(private readonly dlqConsumer: DlqConsumerService) {}

  /** 重投 DLQ 中的一条消息 */
  @Post('dlq/republish')
  async republishOne(): Promise<{ republished: boolean; routingKey?: string }> {
    return this.dlqConsumer.republishOne();
  }

  /** 重投 DLQ 中的所有消息 */
  @Post('dlq/republish-all')
  async republishAll(): Promise<{ count: number }> {
    const count = await this.dlqConsumer.republishAll();
    return { count };
  }
}
