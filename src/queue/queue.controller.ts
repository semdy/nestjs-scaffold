import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DlqConsumerService } from './dlq-consumer.service';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('adminQueue')
@ApiBearerAuth()
@Controller('admin/queue')
@Roles('admin')
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
