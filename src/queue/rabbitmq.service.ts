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
  private readonly deadLetterQueue: string;

  constructor(private readonly configService: ConfigService) {
    this.queue = this.configService.getOrThrow<string>('RABBITMQ_QUEUE');
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
    await this.channel.assertQueue(this.deadLetterQueue, { durable: true });
    await this.channel.assertQueue(this.queue, {
      durable: true,
      deadLetterExchange: '',
      deadLetterRoutingKey: this.deadLetterQueue,
    });
    await this.channel.prefetch(this.configService.get<number>('RABBITMQ_PREFETCH', 10));
    this.logger.log(`RabbitMQ connected, queue=${this.queue}`);
  }

  async publish<T extends object>(routingKey: string, payload: T): Promise<boolean> {
    await this.connect();
    return this.channel!.sendToQueue(
      this.queue,
      Buffer.from(JSON.stringify({ routingKey, payload, publishedAt: new Date().toISOString() })),
      { persistent: true, contentType: 'application/json' },
    );
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
    const parsed = JSON.parse(rawMessage.content.toString()) as Partial<QueueEnvelope>;
    if (!parsed.routingKey || typeof parsed.routingKey !== 'string') {
      throw new Error('Queue message is missing routingKey');
    }
    if (!parsed.payload || typeof parsed.payload !== 'object') {
      throw new Error('Queue message is missing payload');
    }
    return {
      routingKey: parsed.routingKey,
      payload: parsed.payload,
      publishedAt: parsed.publishedAt ?? new Date().toISOString(),
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }
}
