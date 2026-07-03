import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { USER_CREATED_ROUTING_KEY, UserCreatedEvent } from './events/user-created.event';
import { UserCreatedHandler } from './handlers/user-created.handler';
import { QueueEnvelope, RabbitmqService } from './rabbitmq.service';
import { IdempotencyService } from './idempotency.guard';
import { ProcessedEvent } from './processed-event.entity';
import { SkipMessageError } from '../common/exceptions/errors.definitions';

@Injectable()
export class RabbitmqConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(RabbitmqConsumer.name);

  constructor(
    @InjectRepository(ProcessedEvent)
    private readonly processedEventRepo: Repository<ProcessedEvent>,
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
    // 第一道：Redis 快速去重
    if (await this.idempotencyService.isProcessed(message.eventId, message.routingKey)) {
      this.logger.warn(
        `Duplicate event skipped: eventId=${message.eventId}, routingKey=${message.routingKey}`,
      );
      return;
    }

    // 第二道：事务内数据库去重
    const processed = await this.processedEventRepo.findOne({
      where: { eventId: message.eventId },
      select: ['eventId'],
    });

    if (processed) {
      // 更新至redis
      await this.idempotencyService.markProcessed(message.eventId, message.routingKey);
      this.logger.warn(
        `Duplicate event skipped by DB: eventId=${message.eventId}, routingKey=${message.routingKey}`,
      );
      return;
    }

    const lockAcquired = await this.idempotencyService.acquireProcessingLock(
      message.eventId,
      message.routingKey,
    );

    if (!lockAcquired) {
      this.logger.warn(
        `Event is already being processed: eventId=${message.eventId}, routingKey=${message.routingKey}`,
      );
      throw new SkipMessageError();
    }

    try {
      switch (message.routingKey) {
        case USER_CREATED_ROUTING_KEY:
          await this.userCreatedHandler.handle({
            ...message,
            payload: this.parseUserCreatedPayload(message.payload),
          });
          break;
        default:
          this.logger.warn(`No handler registered for routingKey=${message.routingKey}`);
      }

      await this.markProcessed(message);
    } catch (error) {
      await this.idempotencyService.releaseProcessingLock(message.eventId, message.routingKey);
      throw error;
    }
  }

  private async markProcessed(message: QueueEnvelope): Promise<void> {
    try {
      await this.processedEventRepo.insert({
        eventId: message.eventId,
        routingKey: message.routingKey,
        processedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 86400_000), // 7天
      });
      await this.idempotencyService.markProcessed(message.eventId, message.routingKey);
      await this.idempotencyService.releaseProcessingLock(message.eventId, message.routingKey);
    } catch (error) {
      // 唯一约束冲突 = 已处理过，安全跳过
      if (this.isProcessedEventConflict(error)) {
        this.logger.warn(`DB dedup: event ${message.eventId} already processed, skipping`);
        await this.idempotencyService.markProcessed(message.eventId, message.routingKey);
        await this.idempotencyService.releaseProcessingLock(message.eventId, message.routingKey);
        throw new SkipMessageError(); // 自定义错误，上层 catch 做 ack
      }
      throw error; // 其他错误正常抛，触发重试
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

  private isProcessedEventConflict(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as {
      code?: string;
      errno?: number;
    };

    return driverError.code === '23505' || driverError.errno === 1062;
  }
}
