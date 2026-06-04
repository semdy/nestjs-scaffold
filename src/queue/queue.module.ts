import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UserCreatedHandler } from './handlers/user-created.handler';
import { RabbitmqConsumer } from './rabbitmq.consumer';
import { RabbitmqService } from './rabbitmq.service';
import { DlqConsumerService } from './dlq-consumer.service';
import { OutboxCleanupService } from './outbox-cleanup.service';
import { QueueAdminController } from './queue.controller';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [QueueAdminController],
  providers: [
    RabbitmqService,
    RabbitmqConsumer,
    UserCreatedHandler,
    DlqConsumerService,
    OutboxCleanupService,
  ],
  exports: [RabbitmqService],
})
export class QueueModule {}
