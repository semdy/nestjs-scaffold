import { Body, Controller, Post } from '@nestjs/common';
import { DlqConsumerService } from './dlq-consumer.service';

@Controller('admin/queue')
export class QueueAdminController {
  constructor(private readonly dlqConsumer: DlqConsumerService) {}

  @Post('dlq/republish')
  async republishFromDlq(
    @Body() body: { content: string; routingKey: string },
  ): Promise<{ ok: boolean }> {
    await this.dlqConsumer.republish(Buffer.from(body.content, 'utf-8'), body.routingKey);
    return { ok: true };
  }
}
