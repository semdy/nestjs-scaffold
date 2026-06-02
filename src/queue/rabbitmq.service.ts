import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, { Channel, ChannelModel, ConsumeMessage } from 'amqplib';

export interface QueueEnvelope<T extends object = Record<string, unknown>> {
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
  private readonly queue: string;
  private readonly exchange?: string;
  private readonly exchangeType: 'direct' | 'topic' | 'fanout' | 'headers';
  private readonly bindingKey: string;
  private readonly deadLetterQueue: string;

  constructor(private readonly configService: ConfigService) {
    this.queue = this.configService.getOrThrow<string>('RABBITMQ_QUEUE');
    this.exchange = this.configService.get<string>('RABBITMQ_EXCHANGE')?.trim() || undefined;
    this.exchangeType = this.configService.get<'direct' | 'topic' | 'fanout' | 'headers'>(
      'RABBITMQ_EXCHANGE_TYPE',
      'topic',
    );
    this.bindingKey = this.configService.get<string>('RABBITMQ_BINDING_KEY', '#');
    this.deadLetterQueue = `${this.queue}.dlq`;
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
    if (this.exchange) {
      await this.channel.assertExchange(this.exchange, this.exchangeType, { durable: true });
    }
    await this.channel.assertQueue(this.deadLetterQueue, { durable: true });
    await this.channel.assertQueue(this.queue, {
      durable: true,
      deadLetterExchange: '',
      deadLetterRoutingKey: this.deadLetterQueue,
    });
    if (this.exchange) {
      await this.channel.bindQueue(this.queue, this.exchange, this.bindingKey);
    }
    await this.channel.prefetch(this.configService.get<number>('RABBITMQ_PREFETCH', 10));
    this.logger.log(
      `RabbitMQ connected, queue=${this.queue}${
        this.exchange ? `, exchange=${this.exchange}, bindingKey=${this.bindingKey}` : ''
      }`,
    );
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
      this.logger.error(
        `RabbitMQ message failed, queue=${this.queue}`,
        error instanceof Error ? error.stack : String(error),
      );
      this.channel!.nack(rawMessage, false, false);
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

    if (parsed.payload && typeof parsed.payload === 'object') {
      return {
        routingKey,
        payload: parsed.payload as Record<string, unknown>,
        publishedAt: this.resolvePublishedAt(parsed),
      };
    }

    if (typeof parsed === 'object' && parsed !== null) {
      return {
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

  async onApplicationShutdown(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }
}
