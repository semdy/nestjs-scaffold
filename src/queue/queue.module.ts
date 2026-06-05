import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserCreatedHandler } from './handlers/user-created.handler';
import { RabbitmqConsumer } from './rabbitmq.consumer';
import { RabbitmqService } from './rabbitmq.service';
import { DlqConsumerService } from './dlq-consumer.service';
import { EventsCleanupService } from './events-cleanup.service';
import { QueueAdminController } from './queue.controller';
import { RedisService } from '../redis/redis.service';
import { OutboxEvent } from './outbox-event.entity';
import { ProcessedEvent } from './processed-event.entity';
import { IdempotencyService } from './idempotency.guard';

@Global()
@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([OutboxEvent, ProcessedEvent]),
  ],
  controllers: [QueueAdminController],
  providers: [
    RedisService,
    RabbitmqService,
    RabbitmqConsumer,
    UserCreatedHandler,
    IdempotencyService,
    DlqConsumerService,
    EventsCleanupService,
  ],
  exports: [RabbitmqService],
})
export class QueueModule {}
