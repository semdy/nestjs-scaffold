import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { USER_CREATED_ROUTING_KEY, UserCreatedEvent } from './events/user-created.event';
import { UserCreatedHandler } from './handlers/user-created.handler';
import { QueueEnvelope, RabbitmqService } from './rabbitmq.service';
import { IdempotencyService } from './idempotency.guard';

@Injectable()
export class RabbitmqConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(RabbitmqConsumer.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitmqService: RabbitmqService,
    private readonly userCreatedHandler: UserCreatedHandler,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.configService.get<boolean>('RABBITMQ_CONSUMER_ENABLED', true)) {
      this.logger.log('RabbitMQ consumer disabled');
      return;
    }

    await this.rabbitmqService.consume((message) => this.dispatch(message));
  }

  private async dispatch(message: QueueEnvelope): Promise<void> {
    // 去重检查：如果已处理过，直接 ack
    if (await this.idempotencyService.isDuplicate(message.eventId, message.routingKey)) {
      this.logger.warn(
        `Duplicate event skipped: eventId=${message.eventId}, routingKey=${message.routingKey}`,
      );
      return;
    }

    switch (message.routingKey) {
      case USER_CREATED_ROUTING_KEY:
        await this.userCreatedHandler.handle({
          ...message,
          payload: this.parseUserCreatedPayload(message.payload),
        });
        return;
      default:
        this.logger.warn(`No handler registered for routingKey=${message.routingKey}`);
    }
  }

  private parseUserCreatedPayload(payload: Record<string, unknown>): UserCreatedEvent {
    const { userId, tenantId, email, occurredAt } = payload;
    if (
      typeof userId !== 'string' ||
      typeof tenantId !== 'string' ||
      typeof email !== 'string' ||
      typeof occurredAt !== 'string'
    ) {
      throw new Error('Invalid user.created payload');
    }

    return { userId, tenantId, email, occurredAt };
  }
}
