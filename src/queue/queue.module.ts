import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UserCreatedHandler } from './handlers/user-created.handler';
import { RabbitmqConsumer } from './rabbitmq.consumer';
import { RabbitmqService } from './rabbitmq.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RabbitmqService, RabbitmqConsumer, UserCreatedHandler],
  exports: [RabbitmqService],
})
export class QueueModule {}
