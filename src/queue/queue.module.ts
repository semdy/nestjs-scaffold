import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { UserCreatedHandler } from './handlers/user-created.handler';
import { RabbitmqConsumer } from './rabbitmq.consumer';
import { RabbitmqService } from './rabbitmq.service';
import { DlqConsumerService } from './dlq-consumer.service';
import { EventsCleanupService } from './events-cleanup.service';
import { QueueAdminController } from './queue.controller';
import { IdempotencyService } from './idempotency.guard';

@Global()
@Module({
  imports: [ConfigModule, ScheduleModule.forRoot()],
  controllers: [QueueAdminController],
  providers: [
    RabbitmqService,
    RabbitmqConsumer,
    DlqConsumerService,
    UserCreatedHandler,
    IdempotencyService,
    EventsCleanupService,
  ],
  exports: [RabbitmqService],
})
export class QueueModule {}
