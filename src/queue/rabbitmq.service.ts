import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import amqp, { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { SkipMessageError } from '../common/exceptions/errors.definitions';
import { parseJSON } from '@/common/utils/utils';

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

@Injectable()
export class RabbitmqService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection?: ChannelModel;
  private channel?: Channel;
  private connectPromise?: Promise<void>;
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

  /** 建立连接（原子化：并发调用复用同一个 Promise） */
  async connect(): Promise<void> {
    if (this.channel) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }
    this.connectPromise = this.establishConnection();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = undefined;
    }
  }

  private async establishConnection(): Promise<void> {
    this.connection = await amqp.connect(this.configService.getOrThrow<string>('RABBITMQ_URL'));
    this.channel = await this.connection.createChannel();

    this.connection.on('close', () => {
      if (this.isShuttingDown) return;
      this.logger.warn('RabbitMQ connection closed unexpectedly');
      this.scheduleReconnect();
    });

    this.connection.on('error', (err) => {
      this.logger.error('RabbitMQ connection error:', err);
    });

    this.channel.on('error', (err) => {
      this.logger.error('RabbitMQ channel error:', err);
      this.scheduleReconnect();
    });

    await this.setupTopology();

    this.reconnectAttempts = 0;
    this.logger.log(
      `RabbitMQ connected, queue=${this.queue}${
        this.exchange ? `, exchange=${this.exchange}, bindingKey=${this.bindingKey}` : ''
      }`,
    );
  }

  private async setupTopology(): Promise<void> {
    if (this.exchange) {
      await this.channel!.assertExchange(this.exchange, this.exchangeType, { durable: true });
    }
    await this.channel!.assertQueue(this.deadLetterQueue, { durable: true });

    // 声明重试队列：每级递增 TTL，到期后通过死信路由回到主队列
    for (let i = 1; i <= this.maxRetries; i++) {
      const ttl = Math.pow(5, i) * 1000; // 5s, 25s, 125s, ...
      const retryQueueOpts: amqp.Options.AssertQueue = {
        durable: true,
        arguments: { 'x-message-ttl': ttl },
      };
      if (this.exchange) {
        // 有 exchange 时：到期消息通过 exchange 路由回主队列
        // 不设 deadLetterRoutingKey，RabbitMQ 保留原始 routing key，
        // 通过 exchange 的 # binding 匹配回到主队列
        retryQueueOpts.deadLetterExchange = this.exchange;
      } else {
        // 无 exchange 时：通过默认 exchange 直接投递到主队列
        retryQueueOpts.deadLetterExchange = '';
        retryQueueOpts.deadLetterRoutingKey = this.queue;
      }
      await this.channel!.assertQueue(`${this.queue}.retry.${i}`, retryQueueOpts);
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
        .then(() => {
          void this.onReconnected();
        })
        .catch((err) => {
          this.logger.error('RabbitMQ reconnection failed:', err);
          this.isReconnecting = false;
          this.scheduleReconnect();
        })
        .finally(() => {
          this.isReconnecting = false;
        });
    }, delay);
  }

  /** 重连成功后：重新注册 consumer、触发外部回调 */
  private async onReconnected(): Promise<void> {
    if (this.consumerHandler) {
      await this.registerConsumer(this.consumerHandler);
    }
    for (const cb of this.reconnectCallbacks) {
      try {
        await cb();
      } catch (err) {
        this.logger.error('Reconnect callback failed:', err);
      }
    }
  }

  async createChannel(): Promise<Channel> {
    await this.connect();
    return this.connection!.createChannel();
  }

  async publish<T extends object>(routingKey: string, payload: T): Promise<boolean> {
    await this.connect();
    const eventId = randomUUID();
    const body = Buffer.from(
      JSON.stringify({ id: eventId, routingKey, payload, publishedAt: new Date().toISOString() }),
    );
    const options = { persistent: true, contentType: 'application/json', messageId: eventId };

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
    let routingKey: string | undefined;
    try {
      const message = this.parseMessage(rawMessage);
      routingKey = message.routingKey;
      await handler(message, rawMessage);
      this.channel!.ack(rawMessage);
    } catch (error) {
      if (error instanceof SkipMessageError) {
        // 去重拦截，安全跳过，ack 掉消息
        this.channel!.ack(rawMessage);
        return;
      }

      this.logger.error('handleMessage error: ', error);

      const retryCount = this.getRetryCount(rawMessage);
      if (!routingKey) {
        // parseMessage 可能已经抛异常了，尝试从 body 中提取 routingKey
        routingKey =
          this.tryGetRoutingKeyFromBody(rawMessage.content) ?? rawMessage.fields.routingKey;
      }

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
          headers: {
            'x-retry-count': retryCount + 1,
            'x-original-routing-key': routingKey,
          },
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

  /** 从消息体中尝试提取 routingKey（parseMessage 失败时的降级手段） */
  tryGetRoutingKeyFromBody(content: Buffer): string | undefined {
    try {
      const parsed = JSON.parse(content.toString()) as Record<string, unknown>;
      const payload = parsed.payload as Record<string, unknown> | undefined;
      return (parsed.routingKey as string) || (payload?.routingKey as string) || undefined;
    } catch {
      return undefined;
    }
  }

  private parseMessage(rawMessage: ConsumeMessage): QueueEnvelope {
    const parsed = JSON.parse(rawMessage.content.toString()) as Record<string, unknown>;
    const payload = parsed.payload as undefined | Record<string, unknown>;

    // 路由键优先级：body 字段 > 重试时保存的 header > AMQP 原生 routingKey
    // body 里的 routingKey 由 Debezium Outbox Router 写入，经过 retry/DLQ 也不会变；
    // AMQP routingKey 在 retry（sendToQueue）和 DLQ（deadLetterRoutingKey）时会丢失原始值
    const routingKey =
      (typeof parsed.routingKey === 'string' ? parsed.routingKey : '') ||
      (rawMessage.properties.headers?.['x-original-routing-key'] as string | undefined) ||
      rawMessage.fields.routingKey ||
      (payload?.routingKey as string | undefined);

    if (!routingKey) {
      throw new Error('Queue message is missing routingKey');
    }

    // 优先从 AMQP messageId 取，其次从 body 的 id/eventId 字段取
    // Debezium Outbox Router 通常不把 id 放进 body，messageId 也取决于 connector 配置
    const eventId =
      (rawMessage.properties.messageId as string) ||
      (parsed.id as string) ||
      (payload?.id as string) ||
      this.parseIdFromDebeziumHeader(rawMessage.properties.headers?.id);

    if (!eventId) {
      throw new Error('Queue message is missing eventId');
    }

    if (!payload || typeof payload !== 'object') {
      throw new Error('Queue message is missing payload or invalid');
    }

    return {
      eventId,
      routingKey,
      payload: parseJSON(payload.payload) ?? payload,
      publishedAt: this.resolvePublishedAt(parsed),
    };
  }

  private parseIdFromDebeziumHeader(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    try {
      return (JSON.parse(value) as Record<string, unknown>).payload as string;
    } catch {
      return value;
    }
  }

  private resolvePublishedAt(parsed: Record<string, unknown>): string {
    if (typeof parsed.publishedAt === 'string') {
      return parsed.publishedAt;
    }
    const payload = parsed.payload as Record<string, unknown>;
    if (typeof payload.publishedAt === 'string') {
      return payload.publishedAt;
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
