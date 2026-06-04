import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, ConsumeMessage } from 'amqplib';
import { RabbitmqService } from './rabbitmq.service';

@Injectable()
export class DlqConsumerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DlqConsumerService.name);
  private readonly dlqQueue: string;
  private readonly mainQueue: string;
  private readonly exchange?: string;
  private channel?: Channel;

  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitmqService: RabbitmqService,
  ) {
    this.mainQueue = this.configService.getOrThrow<string>('RABBITMQ_QUEUE');
    this.dlqQueue = `${this.mainQueue}.dlq`;
    this.exchange = this.configService.get<string>('RABBITMQ_EXCHANGE')?.trim() || undefined;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.configService.get<boolean>('RABBITMQ_DLQ_CONSUMER_ENABLED', true)) {
      return;
    }
    // 复用 RabbitmqService 的连接，创建独立 channel 避免互相影响
    await this.rabbitmqService.connect();
    this.channel = await this.rabbitmqService.connection?.createChannel();
    if (!this.channel) return;
    await this.channel.assertQueue(this.dlqQueue, { durable: true });
    await this.channel.prefetch(1);

    await this.channel.consume(this.dlqQueue, (msg) => {
      if (!msg) return;
      this.handleDlqMessage(msg);
    });

    this.logger.log(`DLQ consumer started on ${this.dlqQueue}`);
  }

  private handleDlqMessage(msg: ConsumeMessage): void {
    const deathCount = this.getDeathCount(msg);

    this.logger.error(
      `DLQ message: routingKey=${msg.fields.routingKey}, ` +
        `deathCount=${deathCount}, body=${msg.content.toString().slice(0, 200)}`,
    );

    // 死信消息只 ack 掉并告警，不做自动重投
    // 生产环境应接入告警系统（Slack / PagerDuty 等）
    this.channel!.ack(msg);
  }

  /** 手动重投接口：运维确认问题修复后，通过 API 调用 */
  async republish(msgContent: Buffer, routingKey: string): Promise<void> {
    const options = { persistent: true, contentType: 'application/json' };
    if (this.exchange) {
      this.channel!.publish(this.exchange, routingKey, msgContent, options);
    } else {
      this.channel!.sendToQueue(this.mainQueue, msgContent, options);
    }
    this.logger.warn(`Republished DLQ message to main queue, routingKey=${routingKey}`);
  }

  private getDeathCount(msg: ConsumeMessage): number {
    const death = msg.properties.headers?.['x-death'];
    if (Array.isArray(death) && death.length > 0) {
      return death[0].count ?? 1;
    }
    return 1;
  }
}
