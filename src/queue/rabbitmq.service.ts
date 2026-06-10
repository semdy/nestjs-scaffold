import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { SkipMessageError } from '../common/exceptions/errors.definitions';

export interface QueueEnvelope<T extends object = Record<string, unknown>> {
  eventId: string; // 来自 outbox event 的 id
  routingKey: string;
  payload: T;
  publishedAt: string;
}

export type QueueHandler<T extends object = Record<string, unknown>> = (
  message: QueueEnvelope<T>,
  rawMessage: ConsumeMessage,
) => Promise<void>;

function getErrorMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

@Injectable()
export class RabbitmqService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection?: ChannelModel;
  private channel?: Channel;
  private isShuttingDown = false;
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 30000;
  private consumerHandler?: QueueHandler;
  private readonly reconnectCallbacks: Array<() => Promise<void>> = [];
  private readonly queue: string;
  private readonly exchange?: string;
  private readonly exchangeType: 'direct' | 'topic' | 'fanout' | 'headers';
  private readonly bindingKey: string;
  private readonly deadLetterQueue: string;
  private readonly maxRetries: number;

  constructor(private readonly configService: ConfigService) {
    this.queue = this.configService.getOrThrow<string>('RABBITMQ_QUEUE');
    this.exchange = this.configService.get<string>('RABBITMQ_EXCHANGE')?.trim() || undefined;
    this.exchangeType = this.configService.get<'direct' | 'topic' | 'fanout' | 'headers'>(
      'RABBITMQ_EXCHANGE_TYPE',
      'topic',
    );
    this.bindingKey = this.configService.get<string>('RABBITMQ_BINDING_KEY', '#');
    this.deadLetterQueue = `${this.queue}.dlq`;
    this.maxRetries = this.configService.get<number>('RABBITMQ_MAX_RETRIES', 2);
  }

  /** 注册重连回调，连接恢复后自动执行（如重建 DLQ 专用 channel） */
  onReconnect(callback: () => Promise<void>): void {
    this.reconnectCallbacks.push(callback);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.connect();
  }

  async connect(): Promise<void> {
    if (this.channel) {
      return;
    }

    this.connection = await amqp.connect(this.configService.getOrThrow<string>('RABBITMQ_URL'));
    this.channel = await this.connection.createChannel();

    this.connection.on('close', () => {
      if (this.isShuttingDown) return;
      this.logger.warn('RabbitMQ connection closed unexpectedly');
      this.scheduleReconnect();
    });
    this.connection.on('error', (err) => {
      this.logger.error(`RabbitMQ connection error: ${getErrorMsg(err)}`);
    });
    this.channel.on('error', (err) => {
      this.logger.error(`RabbitMQ channel error: ${getErrorMsg(err)}`);
      this.scheduleReconnect();
    });

    await this.setupTopology();

    this.reconnectAttempts = 0;
    this.logger.log(
      `RabbitMQ connected, queue=${this.queue}${
        this.exchange ? `, exchange=${this.exchange}, bindingKey=${this.bindingKey}` : ''
      }`,
    );

    if (this.consumerHandler) {
      await this.registerConsumer(this.consumerHandler);
    }

    // 非首次连接时，通知外部服务重建资源
    if (this.reconnectAttempts > 0) {
      for (const cb of this.reconnectCallbacks) {
        try {
          await cb();
        } catch (err) {
          this.logger.error(`Reconnect callback failed: ${getErrorMsg(err)}`);
        }
      }
    }
  }

  private async setupTopology(): Promise<void> {
    if (this.exchange) {
      await this.channel!.assertExchange(this.exchange, this.exchangeType, { durable: true });
    }
    await this.channel!.assertQueue(this.deadLetterQueue, { durable: true });

    // 声明重试队列：每级递增 TTL，到期后通过死信路由回到主队列
    for (let i = 1; i <= this.maxRetries; i++) {
      const ttl = Math.pow(5, i) * 1000; // 5s, 25s, 125s, ...
      await this.channel!.assertQueue(`${this.queue}.retry.${i}`, {
        durable: true,
        deadLetterExchange: '',
        deadLetterRoutingKey: this.queue,
        arguments: { 'x-message-ttl': ttl },
      });
    }

    await this.channel!.assertQueue(this.queue, {
      durable: true,
      deadLetterExchange: '',
      deadLetterRoutingKey: this.deadLetterQueue,
    });
    if (this.exchange) {
      await this.channel!.bindQueue(this.queue, this.exchange, this.bindingKey);
    }
    await this.channel!.prefetch(this.configService.get<number>('RABBITMQ_PREFETCH', 10));
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown || this.isReconnecting) return;

    this.isReconnecting = true;
    this.channel = undefined;
    this.connection = undefined;

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
    this.logger.log(`RabbitMQ reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect()
        .catch((err) => {
          this.logger.error(`RabbitMQ reconnection failed: ${getErrorMsg(err)}`);
        })
        .finally(() => {
          this.isReconnecting = false;
        });
    }, delay);
  }

  async createChannel(): Promise<Channel> {
    await this.connect();
    return this.connection!.createChannel();
  }

  async publish<T extends object>(routingKey: string, payload: T): Promise<boolean> {
    await this.connect();
    const body = Buffer.from(
      JSON.stringify({ routingKey, payload, publishedAt: new Date().toISOString() }),
    );
    const options = { persistent: true, contentType: 'application/json' };

    if (this.exchange) {
      return this.channel!.publish(this.exchange, routingKey, body, options);
    }

    return this.channel!.sendToQueue(this.queue, body, options);
  }

  async consume(handler: QueueHandler): Promise<void> {
    this.consumerHandler = handler;
    await this.registerConsumer(handler);
  }

  private async registerConsumer(handler: QueueHandler): Promise<void> {
    await this.connect();
    await this.channel!.consume(
      this.queue,
      (rawMessage) => {
        if (!rawMessage) {
          return;
        }

        void this.handleMessage(rawMessage, handler);
      },
      { noAck: false },
    );
    this.logger.log(`RabbitMQ consumer started, queue=${this.queue}, dlq=${this.deadLetterQueue}`);
  }

  private async handleMessage(rawMessage: ConsumeMessage, handler: QueueHandler): Promise<void> {
    try {
      const message = this.parseMessage(rawMessage);
      await handler(message, rawMessage);
      this.channel!.ack(rawMessage);
    } catch (error) {
      if (error instanceof SkipMessageError) {
        // 去重拦截，安全跳过，ack 掉消息
        this.channel!.ack(rawMessage);
        return;
      }

      const retryCount = this.getRetryCount(rawMessage);
      const routingKey = rawMessage.fields.routingKey;

      if (retryCount < this.maxRetries) {
        // 投递到重试队列，消息到期后自动回到主队列
        const retryQueue = `${this.queue}.retry.${retryCount + 1}`;
        this.logger.warn(
          `Retrying message (attempt=${retryCount + 1}/${this.maxRetries}), ` +
            `queue=${this.queue}, routingKey=${routingKey}`,
        );
        // 先发到 retry 队列
        const sent = this.channel!.sendToQueue(retryQueue, rawMessage.content, {
          persistent: true,
          contentType: 'application/json',
          headers: { 'x-retry-count': retryCount + 1 },
        });
        if (sent) {
          this.channel!.ack(rawMessage); // 发送成功才 ack
        } else {
          // sendToQueue 失败，消息留在主队列，下次重投
          // 或直接进 DLQ
          this.channel!.nack(rawMessage, false, false);
          this.logger.error(`Failed to send to retry queue ${retryQueue}, message going to DLQ`);
        }
      } else {
        // 超过最大重试次数，nack 进 DLQ
        this.logger.error(
          `Message exceeded max retries (${this.maxRetries}), sending to DLQ, ` +
            `queue=${this.queue}, routingKey=${routingKey}`,
          error instanceof Error ? error.stack : String(error),
        );
        this.channel!.nack(rawMessage, false, false);
      }
    }
  }

  private parseMessage(rawMessage: ConsumeMessage): QueueEnvelope {
    const parsed = JSON.parse(rawMessage.content.toString()) as Record<string, unknown>;
    const rawRoutingKey = rawMessage.fields.routingKey;
    const routingKey =
      typeof parsed.routingKey === 'string'
        ? parsed.routingKey
        : typeof rawRoutingKey === 'string' && rawRoutingKey.length > 0
          ? rawRoutingKey
          : undefined;

    if (!routingKey) {
      throw new Error('Queue message is missing routingKey');
    }

    //优先从 AMQP messageId 取，其次从 body 的 id/eventId 字段取
    const eventId =
      (rawMessage.properties.messageId as string) ||
      (typeof parsed.id === 'string' ? parsed.id : '') ||
      (typeof parsed.eventId === 'string' ? parsed.eventId : '');

    if (!eventId) {
      throw new Error('Queue message is missing eventId');
    }

    if (parsed.payload && typeof parsed.payload === 'object') {
      return {
        eventId,
        routingKey,
        payload: parsed.payload as Record<string, unknown>,
        publishedAt: this.resolvePublishedAt(parsed),
      };
    }

    if (typeof parsed === 'object' && parsed !== null) {
      return {
        eventId,
        routingKey,
        payload: parsed,
        publishedAt: this.resolvePublishedAt(parsed),
      };
    }

    throw new Error('Queue message is missing payload');
  }

  private resolvePublishedAt(parsed: Record<string, unknown>): string {
    if (typeof parsed.publishedAt === 'string') {
      return parsed.publishedAt;
    }
    if (typeof parsed.createdAt === 'string') {
      return parsed.createdAt;
    }
    return new Date().toISOString();
  }

  private getRetryCount(rawMessage: ConsumeMessage): number {
    return (rawMessage.properties.headers?.['x-retry-count'] as number) ?? 0;
  }

  async onApplicationShutdown(): Promise<void> {
    this.isShuttingDown = true;
    await this.channel?.close();
    await this.connection?.close();
  }
}
